/**
 * Model bake-off: run one still through every plausible Replicate video model, put each
 * result through the same deterministic matte/loop/gate chain, and score identity with
 * the VLM judge. The question is not "does it move" - every model moves - it is "is it
 * still the same character afterwards".
 *
 *   node scripts/emoji-enhancement/animate-bakeoff.mjs meow_facepalm
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import sharp from 'sharp';
import {predict, downloadPrediction} from './replicate.mjs';
import {KEY, keyPlate, unkey, temporalMedianAlpha, findLoop, gate} from './animate-replicate.mjs';
import {identityCheck} from './identity-check.mjs';

const exec = promisify(execFile);
const S = 512;

/**
 * Per-model input adapters. Each takes {plate, motion, prompt} data URIs and returns the
 * model's own input shape - the schemas disagree on almost every field name.
 * `motionRef: true` marks models driven by a reference video instead of a text prompt.
 */
export const ENTRANTS = [
  {
    id: 'seedance-1-lite', model: 'bytedance/seedance-1-lite',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, fps: 24, resolution: '480p', camera_fixed: true}),
  },
  {
    id: 'seedance-1.5-pro', model: 'bytedance/seedance-1.5-pro',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, fps: 24, camera_fixed: true, generate_audio: false}),
  },
  {
    id: 'seedance-2.0', model: 'bytedance/seedance-2.0',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, resolution: '480p', generate_audio: false}),
  },
  {
    // The one entrant that can be shown the character separately from the start frame.
    id: 'seedance-2.0-ref', model: 'bytedance/seedance-2.0',
    input: ({plate, prompt}) => ({image: plate, reference_images: [plate], prompt, duration: 5, resolution: '480p', generate_audio: false}),
  },
  {
    id: 'kling-v2.5-turbo-pro', model: 'kwaivgi/kling-v2.5-turbo-pro',
    input: ({plate, prompt}) => ({start_image: plate, prompt, duration: 5, aspect_ratio: '1:1'}),
  },
  {
    // end_image = start_image is the loop-closure trick seedance-1-lite refused.
    id: 'kling-v2.5-loop', model: 'kwaivgi/kling-v2.5-turbo-pro',
    input: ({plate, prompt}) => ({start_image: plate, end_image: plate, prompt, duration: 5, aspect_ratio: '1:1'}),
  },
  {
    id: 'kling-v2.6', model: 'kwaivgi/kling-v2.6',
    input: ({plate, prompt}) => ({start_image: plate, prompt, duration: 5, aspect_ratio: '1:1', generate_audio: false}),
  },
  {
    id: 'kling-v2.6-motion', model: 'kwaivgi/kling-v2.6-motion-control', motionRef: true,
    input: ({plate, motion, prompt}) => ({image: plate, video: motion, prompt, mode: 'std', keep_original_sound: false, character_orientation: 'image'}),
  },
  {
    id: 'kling-v3-motion', model: 'kwaivgi/kling-v3-motion-control', motionRef: true,
    input: ({plate, motion, prompt}) => ({image: plate, video: motion, prompt, mode: 'std', keep_original_sound: false, character_orientation: 'image'}),
  },
  {
    // Trained for Live2D and general animation rather than photographic motion - on paper the
    // closest prior to a flat 2D cartoon of anything tested here.
    id: 'minimax-video-01-live', model: 'minimax/video-01-live',
    input: ({plate, prompt}) => ({first_frame_image: plate, prompt, prompt_optimizer: false}),
  },
  {
    id: 'pixverse-v5', model: 'pixverse/pixverse-v5',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, quality: '540p', aspect_ratio: '1:1',
      negative_prompt: 'new facial features, added mouth, changed eyes, extra whiskers, shading, gradients, 3d, camera movement, zoom'}),
  },
  {
    id: 'grok-imagine', model: 'xai/grok-imagine-video',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, resolution: '480p', aspect_ratio: '1:1'}),
  },
  {
    id: 'wan-2.2-i2v-fast', model: 'wan-video/wan-2.2-i2v-fast',
    input: ({plate, prompt}) => ({image: plate, prompt, num_frames: 81, resolution: '480p', frames_per_second: 16}),
  },
  {
    // Motion transfer route two: character image + motion video, no text steering of the action.
    id: 'wan-2.2-animate', model: 'wan-video/wan-2.2-animate-animation', motionRef: true,
    input: ({plate, motion}) => ({character_image: plate, video: motion, resolution: '480', frames_per_second: 24, go_fast: true}),
  },
  {
    // Advertises cartoons and non-humans explicitly, despite the "human subject" field doc.
    id: 'dreamactor-m2', model: 'bytedance/dreamactor-m2.0', motionRef: true,
    input: ({plate, motion}) => ({image: plate, video: motion, cut_first_second: false}),
  },

  // --- frontier tier ---
  {
    // No 1:1 aspect ratio available; output is centre-cropped downstream.
    id: 'veo-3.1-fast', model: 'google/veo-3.1-fast',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 4, resolution: '720p', aspect_ratio: '16:9',
      generate_audio: false, negative_prompt: NEGATIVE}),
  },
  {
    id: 'sora-2', model: 'openai/sora-2',
    input: ({plate, prompt}) => ({input_reference: plate, prompt, seconds: 4, aspect_ratio: 'landscape'}),
  },
  {
    id: 'grok-imagine-1.5', model: 'xai/grok-imagine-video-1.5',
    input: ({plate, prompt}) => ({image: plate, prompt, duration: 5, resolution: '480p', aspect_ratio: '1:1'}),
  },
  {
    // The only entrant with a native `loop` flag, and it takes 1:1 directly.
    id: 'ray-3.2-loop', model: 'luma/ray-3.2',
    input: ({plate, prompt}) => ({start_image: plate, prompt, duration: 5, resolution: '540p', aspect_ratio: '1:1', loop: true}),
  },
  {
    id: 'gemini-omni-1.1', model: 'google/gemini-omni-1.1',
    input: ({plate, prompt}) => ({image: plate, prompt, resolution: '720p', aspect_ratio: '16:9'}),
  },
];

const NEGATIVE = 'new facial features, added mouth, added nose, changed eye shape, extra whiskers, shading, gradients, fur texture, 3d rendering, camera movement, zoom, pan';

const uri = async (file, mime) => `data:${mime};base64,` + (await fs.readFile(file)).toString('base64');

/** Turns an existing animated emoji into an mp4 the motion-control models will accept. */
export async function motionReference(name, out) {
  const dir = path.dirname(out);
  await fs.mkdir(dir, {recursive: true});
  await exec('webpmux', ['-info', `public/emojis/${name}.webp`]).catch(() => {});
  const frames = path.join(dir, 'mref');
  await fs.mkdir(frames, {recursive: true});
  // anim_dump is unavailable; decode via the delivery raster sequence using ffmpeg's webp demuxer
  // fallback - libwebp's webpmux can split frames deterministically.
  const info = (await exec('webpmux', ['-info', `public/emojis/${name}.webp`])).stdout;
  const count = (info.match(/^\s*\d+:/gm) || []).length;
  for (let i = 1; i <= count; i++) {
    await exec('webpmux', ['-get', 'frame', String(i), `public/emojis/${name}.webp`, '-o', path.join(frames, `f-${String(i).padStart(3, '0')}.webp`)]);
    await sharp(path.join(frames, `f-${String(i).padStart(3, '0')}.webp`)).resize(S, S)
      .flatten({background: {r: KEY.rgb[0], g: KEY.rgb[1], b: KEY.rgb[2]}})
      .png().toFile(path.join(frames, `f-${String(i).padStart(3, '0')}.png`));
  }
  await exec('ffmpeg', ['-v', 'error', '-framerate', '12', '-i', path.join(frames, 'f-%03d.png'),
    '-vf', 'format=yuv420p', '-r', '24', '-y', out]);
  return {out, frames: count};
}

async function downstream({clip, dir, source, target, displacement, name}) {
  // Centre-crop to square before scaling: several frontier models (veo, sora, gemini-omni)
  // offer no 1:1 aspect ratio, and scaling a 16:9 frame straight to 512x512 would squash the
  // subject and corrupt every geometric measurement downstream. No-op for square clips.
  await exec('ffmpeg', ['-v', 'error', '-i', clip,
    '-vf', `crop='min(iw,ih)':'min(iw,ih)',scale=${S}:${S}`, '-y', path.join(dir, 'src-%03d.png')]);
  const files = (await fs.readdir(dir)).filter(f => f.startsWith('src-')).sort();
  const raw = await Promise.all(files.map(f => sharp(path.join(dir, f)).resize(S, S).ensureAlpha().raw().toBuffer()));
  const matted = temporalMedianAlpha(raw.map(f => unkey(f)));
  const loop = findLoop(matted, {target, max: Math.min(96, matted.length - 1)});
  const report = gate(loop.frames, source, {displacement});

  const out = [];
  for (const [i, f] of loop.frames.entries()) {
    const file = path.join(dir, `out-${String(i).padStart(2, '0')}.png`);
    await sharp(f, {raw: {width: S, height: S, channels: 4}}).png().toFile(file);
    out.push(file);
  }
  const webp = path.join(dir, `${name}.webp`);
  await exec('img2webp', ['-loop', '0', '-lossy', '-q', '82', '-d', '70', ...out, '-o', webp]);
  const pick = Array.from({length: 8}, (_, i) => out[Math.round(i * (out.length - 1) / 7)]);
  const identity = await identityCheck({source: `public/emojis/${name}.webp`, frames: pick, dir});
  return {clipFrames: raw.length, loop: {start: loop.start, len: loop.len, seam: +loop.seam.toFixed(2), motion: +loop.motion.toFixed(2)}, gate: report, identity, webp, bytes: (await fs.stat(webp)).size};
}

export async function bakeoff(name, {prompt, motionSource = 'meow_nod', target = 24, displacement = 0.25, only} = {}) {
  const root = `staging/bakeoff/${name}`;
  await fs.mkdir(root, {recursive: true});
  const plate = await uri(await keyPlate(`public/emojis/${name}.webp`, path.join(root, 'plate.png')), 'image/png');
  const source = await sharp(`public/emojis/${name}.webp`).resize(S, S).ensureAlpha().raw().toBuffer();

  let motion;
  const entrants = ENTRANTS.filter(e => !only || only.includes(e.id));
  if (entrants.some(e => e.motionRef)) {
    const mref = await motionReference(motionSource, path.join(root, 'motion.mp4'));
    motion = await uri(mref.out, 'video/mp4');
    console.log(`motion reference: ${motionSource}, ${mref.frames} frames`);
  }

  const results = [];
  for (const e of entrants) {
    const dir = path.join(root, e.id);
    await fs.mkdir(dir, {recursive: true});
    const resultFile = path.join(dir, 'result.json');
    try { results.push(JSON.parse(await fs.readFile(resultFile))); console.log(e.id, 'cached'); continue; } catch {}
    try {
      const r = await predict({dir, key: e.id, model: e.model, input: e.input({plate, motion, prompt})});
      const clip = path.join(dir, 'generated.mp4');
      await downloadPrediction(r, clip);
      const d = await downstream({clip, dir, source, target, displacement, name});
      const row = {id: e.id, model: e.model, motionRef: !!e.motionRef, metrics: r.metrics, ...d};
      await fs.writeFile(resultFile, JSON.stringify(row, null, 2));
      results.push(row);
      console.log(`${e.id}: identity ${(d.identity.score * 100).toFixed(0)}% clean, style ${d.identity.styleHeld ? 'held' : 'BROKEN'}, gate ${d.gate.pass ? 'pass' : 'FAIL'}, ${(r.metrics?.predict_time ?? 0).toFixed(0)}s`);
    } catch (error) {
      const row = {id: e.id, model: e.model, error: String(error.message ?? error)};
      await fs.writeFile(resultFile, JSON.stringify(row, null, 2));
      results.push(row);
      console.log(`${e.id}: ERROR ${row.error}`);
    }
  }
  await fs.writeFile(path.join(root, 'bakeoff.json'), JSON.stringify(results, null, 2));
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...rest] = process.argv.slice(2);
  const only = rest.length ? rest : undefined;
  const spec = JSON.parse(await fs.readFile('scripts/animation-candidates.json', 'utf8'));
  const c = spec.candidates.find(x => x.name === name);
  const prompt = `2D flat-vector cartoon animation. ${c.subject}.

Motion: ${c.full.motion}. The cycle returns exactly to the starting pose.

Style: keep the exact flat-vector look of the reference - flat solid fills, uniform heavy black outlines, no shading, no gradients, no fur texture, no 3D rendering. Keep the same colours, line weights and proportions in every frame. Do not add, remove or change any facial feature: no new mouth, no changed eye shape, no extra whiskers.

Framing: locked-off camera, no zoom, no pan, no push-in. The character stays centred at the same scale and never drifts.

Background: the flat green background is a chroma key. Keep it perfectly flat, uniform and unchanged.`;
  const rows = await bakeoff(name, {prompt, only});
  console.log('\n--- ranked by identity ---');
  for (const r of rows.filter(r => !r.error).sort((a, b) => b.identity.score - a.identity.score))
    console.log(`${(r.identity.score * 100).toFixed(0).padStart(3)}%  ${r.id.padEnd(22)} style ${r.identity.styleHeld ? 'held  ' : 'BROKEN'} gate ${r.gate.pass ? 'pass' : 'FAIL'}  ${r.identity.summary}`);
  for (const r of rows.filter(r => r.error)) console.log(`  --  ${r.id.padEnd(22)} ${r.error}`);
}
