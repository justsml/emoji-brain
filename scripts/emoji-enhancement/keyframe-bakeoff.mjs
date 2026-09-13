/**
 * Frontier image-model route. Every video model tested invents a generic cartoon cat face,
 * because motion priors are photographic and the character is not. Image-edit models are
 * built for the opposite property - keep this exact subject, change one thing - so here the
 * animation is generated as a handful of keyframes rather than as video.
 *
 *   node scripts/emoji-enhancement/keyframe-bakeoff.mjs meow_facepalm
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {predict, downloadPrediction} from './replicate.mjs';
import {keyPlate} from './animate-replicate.mjs';
import {identityCheck} from './identity-check.mjs';

const S = 512;

/** One beat of the meow_facepalm swing per keyframe, described as a pose, not as motion. */
export const POSES = [
  'the paw is lowered away from the face, resting at the bottom edge, so the whole face is visible',
  'the paw is raised high above the head, fully clear of the face',
  'the paw is halfway down, just touching the top of the face',
  'the paw is pressed flat across the face exactly as in the reference',
  'the paw is pressed flat across the face and the head is tilted slightly down',
  'the paw is sliding back down, half clear of the face',
];

const PRESERVE = 'Keep the exact same character: identical flat-vector style, identical yellow fill, identical heavy black outline weight, identical eye shape, identical whisker count and placement, identical ears, identical proportions and identical framing on the same flat green background. Do not add a mouth, a nose, eyebrows, a torso, shading, gradients, fur texture or any facial feature that is not in the reference. Change nothing except the described pose.';

export const ENTRANTS = [
  {
    // Designed to emit a consistent series from one call - the closest fit on paper.
    id: 'seedream-4-seq', model: 'bytedance/seedream-4', batch: true,
    input: ({plate}) => ({
      image_input: [plate],
      prompt: `Generate ${POSES.length} frames of a looping animation of this character, in this order: ${POSES.map((p, i) => `(${i + 1}) ${p}`).join('; ')}. ${PRESERVE}`,
      sequential_image_generation: 'auto', max_images: POSES.length,
      aspect_ratio: 'match_input_image', size: '1K',
    }),
  },
  {
    // Already used elsewhere in this repo for still restoration, where it holds identity well.
    id: 'nano-banana-pro', model: 'google/nano-banana-pro',
    input: ({plate, pose}) => ({
      image_input: [plate], prompt: `Redraw this exact emoji with one change: ${pose}. ${PRESERVE}`,
      resolution: '1K', aspect_ratio: 'match_input_image', output_format: 'png', allow_fallback_model: false,
    }),
  },
  {
    id: 'nano-banana-2', model: 'google/nano-banana-2',
    input: ({plate, pose}) => ({
      image_input: [plate], prompt: `Redraw this exact emoji with one change: ${pose}. ${PRESERVE}`,
      resolution: '1K', aspect_ratio: 'match_input_image', output_format: 'png',
    }),
  },
  {
    id: 'gpt-image-2.5', model: 'openai/gpt-image-2.5-sunburst',
    input: ({plate, pose}) => ({
      input_images: [plate], prompt: `Redraw this exact emoji with one change: ${pose}. ${PRESERVE}`,
      quality: 'high', aspect_ratio: '1:1', output_format: 'png', number_of_images: 1, background: 'opaque',
    }),
  },
];

const uri = async file => 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64');

async function save(r, file) {
  await downloadPrediction(r, file);
  await sharp(file).resize(S, S, {fit: 'contain'}).png().toFile(file.replace(/\.png$/, '.norm.png'));
  return file.replace(/\.png$/, '.norm.png');
}

export async function keyframeBakeoff(name, {only} = {}) {
  const root = `staging/keyframes/${name}`;
  await fs.mkdir(root, {recursive: true});
  const plate = await uri(await keyPlate(`public/emojis/${name}.webp`, path.join(root, 'plate.png')));

  const results = [];
  for (const e of ENTRANTS.filter(x => !only || only.includes(x.id))) {
    const dir = path.join(root, e.id);
    await fs.mkdir(dir, {recursive: true});
    try { results.push(JSON.parse(await fs.readFile(path.join(dir, 'result.json')))); console.log(e.id, 'cached'); continue; } catch {}
    try {
      const frames = [];
      const metrics = [];
      if (e.batch) {
        const r = await predict({dir, key: e.id, model: e.model, input: e.input({plate})});
        metrics.push(r.metrics);
        const urls = Array.isArray(r.output) ? r.output : [r.output];
        for (const [i, u] of urls.entries()) frames.push(await save({output: u}, path.join(dir, `k-${i}.png`)));
      } else {
        for (const [i, pose] of POSES.entries()) {
          const r = await predict({dir, key: `${e.id}-${i}`, model: e.model, input: e.input({plate, pose})});
          metrics.push(r.metrics);
          frames.push(await save(r, path.join(dir, `k-${i}.png`)));
        }
      }
      const identity = await identityCheck({source: `public/emojis/${name}.webp`, frames, dir});
      const row = {id: e.id, model: e.model, frames: frames.length,
        predictSeconds: +metrics.reduce((a, m) => a + (m?.predict_time ?? 0), 0).toFixed(1), calls: metrics.length, identity};
      await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(row, null, 2));
      results.push(row);
      console.log(`${e.id}: identity ${(identity.score * 100).toFixed(0)}% clean (${identity.cleanPanels}/${identity.panels}), style ${identity.styleHeld ? 'held' : 'BROKEN'}, ${row.calls} calls, ${row.predictSeconds}s`);
    } catch (error) {
      const row = {id: e.id, model: e.model, error: String(error.message ?? error)};
      await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(row, null, 2));
      results.push(row);
      console.log(`${e.id}: ERROR ${row.error}`);
    }
  }
  await fs.writeFile(path.join(root, 'keyframes.json'), JSON.stringify(results, null, 2));
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...rest] = process.argv.slice(2);
  const rows = await keyframeBakeoff(name, {only: rest.length ? rest : undefined});
  console.log('\n--- ranked by identity ---');
  for (const r of rows.filter(r => !r.error).sort((a, b) => b.identity.score - a.identity.score))
    console.log(`${(r.identity.score * 100).toFixed(0).padStart(3)}%  ${r.id.padEnd(18)} ${String(r.predictSeconds).padStart(6)}s  ${r.identity.summary}`);
  for (const r of rows.filter(r => r.error)) console.log(`  --  ${r.id.padEnd(18)} ${r.error.slice(0, 90)}`);
}
