/**
 * VLM identity gate. The geometric gate in animate-replicate.mjs certifies that a
 * generated loop is stable; it cannot see invented facial features (the meow_facepalm
 * run passed every pixel metric while growing a frown and a new eye). This asks a
 * vision model the question those metrics cannot answer.
 *
 * Model choice follows scripts/emoji-labeler.ts: gemini-3.8-flash, OpenRouter first.
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {generateText} from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';

const env = {...parseEnv(readFileSync('.env', 'utf8')), ...process.env};

function judgeModel() {
  const routerKey = env.OPENROUTER_API_KEY || env.OPENROUTER_AI_KEY;
  if (routerKey) return createOpenRouter({apiKey: routerKey})('google/gemini-3.8-flash');
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) throw Error('No OpenRouter or Google credential for the identity judge');
  return createGoogleGenerativeAI({apiKey: key})('gemini-3.8-flash');
}

/** The judge returns this shape as JSON; generateText keeps us off a zod dependency. */
const SHAPE = `{
  "frames": [{
    "index": <1-based panel number>,
    "sameCharacter": <true if unmistakably the same character as the reference>,
    "inventedFeatures": [<features present here but absent from the reference, e.g. "frowning mouth">],
    "lostFeatures": [<features in the reference missing here>],
    "styleBreak": <true only if flat fills gained shading, gradients, fur texture or 3D rendering>
  }],
  "worstFrame": <1-based index of the least faithful panel>,
  "summary": "<one sentence on the dominant failure, or that there is none>"
}`;

/** Lays sampled frames out as one numbered contact sheet - one image, one call. */
export async function contactSheet(files, out, {cell = 256, cols = 4} = {}) {
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f).resize(cell, cell).flatten({background: {r: 255, g: 255, b: 255}})
      .composite([{
        input: Buffer.from(`<svg width="${cell}" height="${cell}"><text x="8" y="28" font-size="26" font-family="monospace" font-weight="bold" fill="#d00">${i + 1}</text></svg>`),
        top: 0, left: 0,
      }]).png().toBuffer(),
    left: (i % cols) * cell, top: Math.floor(i / cols) * cell,
  })));
  await sharp({create: {width: cols * cell, height: rows * cell, channels: 3, background: {r: 255, g: 255, b: 255}}})
    .composite(tiles).png().toFile(out);
  return out;
}

export async function identityCheck({source, frames, dir}) {
  const sheet = await contactSheet(frames, `${dir}/sheet.png`);
  const ref = await sharp(source).resize(256, 256).flatten({background: {r: 255, g: 255, b: 255}}).png().toBuffer();

  const {text} = await generateText({
    model: judgeModel(),
    messages: [{
      role: 'user',
      content: [
        {type: 'text', text: 'REFERENCE — the original emoji character:'},
        {type: 'image', image: ref},
        {type: 'text', text: `NUMBERED PANELS — frames from an animation generated from that reference. Each panel is numbered in red in its top-left corner.

For every panel, judge only whether it is still the SAME CHARACTER as the reference. Compare facial features precisely: the shape and number of eyes, the mouth (the reference may have no mouth at all, or only a flat line), whisker count and placement, ears, paws, markings.

An added mouth, a changed eye shape, a different whisker count, or a stray object are INVENTED FEATURES — report them even when small. Motion itself (a moved paw, a tilted head, a blink) is expected and is NOT a fault. Judge every numbered panel.

Reply with JSON only, matching exactly this shape:
${SHAPE}`},
        {type: 'image', image: await fs.readFile(sheet)},
      ],
    }],
  });

  const object = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  const clean = object.frames.filter(f => f.sameCharacter && !f.inventedFeatures.length && !f.lostFeatures.length && !f.styleBreak);
  return {
    ...object,
    panels: object.frames.length,
    cleanPanels: clean.length,
    score: object.frames.length ? clean.length / object.frames.length : 0,
    styleHeld: !object.frames.some(f => f.styleBreak),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, dir = `staging/replicate/${name}`] = process.argv.slice(2);
  const all = (await fs.readdir(dir)).filter(f => /^out-\d+\.png$/.test(f)).sort();
  const pick = Array.from({length: 8}, (_, i) => `${dir}/${all[Math.round(i * (all.length - 1) / 7)]}`);
  const r = await identityCheck({source: `public/emojis/${name}.webp`, frames: pick, dir});
  console.log(`identity ${(r.score * 100).toFixed(0)}% clean (${r.cleanPanels}/${r.panels}), style ${r.styleHeld ? 'held' : 'BROKEN'}`);
  console.log(r.summary);
  for (const f of r.frames) if (f.inventedFeatures.length || f.lostFeatures.length || f.styleBreak)
    console.log(`  panel ${f.index}: +[${f.inventedFeatures}] -[${f.lostFeatures}]${f.styleBreak ? ' STYLE-BREAK' : ''}`);
}
