/**
 * Generative animation pipeline: still emoji -> looping animated WebP with real alpha.
 *
 * Stages 2-5 are deterministic and run locally. `--simulate` swaps the paid stage-1
 * call for a synthetic clip built from a local tween, so the whole downstream chain
 * can be proven without spending. Stage 1 only contacts Replicate with --spend.
 *
 *   node scripts/emoji-enhancement/animate-replicate.mjs meow_idea --simulate
 *   node scripts/emoji-enhancement/animate-replicate.mjs meow_facepalm --spend
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import sharp from 'sharp';
import {predict, downloadPrediction} from './replicate.mjs';

const exec = promisify(execFile);
const S = 512;

/**
 * Key colour, chosen by measuring every opaque saturated pixel in the 351-emoji
 * library: hue 144 deg is the emptiest 50-degree window in the corpus (0.59% of
 * saturated pixels) and is empty outright in 9 of the 10 batch-01 candidates.
 * Standard chroma green (#00B140, hue 141) sits inside the same trough.
 */
export const KEY = {rgb: [0, 199, 80], hue: 144};

export const MODEL = 'bytedance/seedance-1-lite';

/** Stage 0. Flattens the still onto the key ground so the model never sees transparency. */
export async function keyPlate(src, out) {
  const buf = await sharp(src).resize(S, S).ensureAlpha()
    .flatten({background: {r: KEY.rgb[0], g: KEY.rgb[1], b: KEY.rgb[2]}})
    .png().toBuffer();
  await fs.writeFile(out, buf);
  return out;
}

/**
 * Stage 1. `camera_fixed` removes the dominant source of subject drift - the model's
 * instinct to add a slow push-in, which on a 64px emoji reads as the character inflating.
 */
export function generationInput({plateURI, prompt, seed}) {
  return {
    image: plateURI,
    // Measured, not assumed: seedance-1-lite rejects (E006) `last_frame_image` when it equals
    // `image`, so the loop cannot be closed at generation time. `reference_images` is likewise
    // rejected alongside `image`. Seam closure is left entirely to findLoop().
    prompt,
    duration: 5,
    fps: 24,
    resolution: '480p',
    camera_fixed: true,
    ...(seed === undefined ? {} : {seed}),
  };
}

/** Stage 2a. Chroma distance in the Cb/Cr plane, with green-spill suppression. */
export function unkey(data, {t0 = 42, t1 = 96} = {}) {
  const cb = p => -0.169 * p[0] - 0.331 * p[1] + 0.5 * p[2];
  const cr = p => 0.5 * p[0] - 0.419 * p[1] - 0.081 * p[2];
  const kb = cb(KEY.rgb), kr = cr(KEY.rgb);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const p = [data[i], data[i + 1], data[i + 2]];
    const d = Math.hypot(cb(p) - kb, cr(p) - kr);
    const a = Math.max(0, Math.min(1, (d - t0) / (t1 - t0)));
    out[i + 3] = Math.round(a * 255);
    if (a > 0) {
      // Spill: where green exceeds both neighbours near the key, pull it back to their mean.
      const cap = (p[0] + p[2]) / 2;
      out[i] = p[0]; out[i + 1] = p[1] > cap ? Math.round(cap + (p[1] - cap) * a) : p[1]; out[i + 2] = p[2];
    }
  }
  return out;
}

/** Stage 2b. Per-pixel temporal median of alpha - kills the 1-frame matte flicker. */
export function temporalMedianAlpha(frames) {
  const n = frames.length;
  const copy = frames.map(f => Buffer.from(f));
  for (let k = 0; k < n; k++) {
    const a = frames[(k - 1 + n) % n], b = frames[k], c = frames[(k + 1) % n];
    for (let i = 3; i < b.length; i += 4) {
      const [x, y, z] = [a[i], b[i], c[i]].sort((m, n2) => m - n2);
      copy[k][i] = y;
    }
  }
  return copy;
}

/** Alpha-weighted centroid, bounding box and opaque area - the drift/scale gate inputs. */
export function shape(frame) {
  let sx = 0, sy = 0, w = 0, minx = S, maxx = 0, miny = S, maxy = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = frame[(y * S + x) * 4 + 3];
    if (a < 128) continue;
    sx += x * a; sy += y * a; w += a;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return w ? {cx: sx / w, cy: sy / w, box: [minx, miny, maxx, maxy], area: w / 255} : null;
}

/** Mean per-channel distance between two RGBA frames, over the union of their coverage. */
export function frameDistance(a, b) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 16 && b[i + 3] < 16) continue;
    for (let c = 0; c < 4; c++) sum += Math.abs(a[i + c] - b[i + c]);
    n += 4;
  }
  return n ? sum / n : 0;
}

/**
 * Stage 3. Video-textures loop finding: pick the window whose endpoints match best,
 * then uniformly resample it to the frame count the spec asked for.
 */
export function findLoop(frames, {min = 16, max = 96, target = 24, motionFloor = 8} = {}) {
  // Minimising seam alone degenerates: the stillest window in the clip always has the
  // best-matching endpoints, so the search reliably returns the passage where the model
  // did nothing. Windows must clear a motion floor before they compete on seam.
  const step = frames.map((f, i) => (i ? frameDistance(frames[i - 1], f) : 0));
  let best = null, bestAny = null;
  for (let start = 0; start < frames.length; start++) {
    for (let len = min; len <= max && start + len < frames.length; len++) {
      const seam = frameDistance(frames[start], frames[start + len]);
      let motion = 0;
      for (let i = start + 1; i <= start + len; i++) motion = Math.max(motion, step[i]);
      const cand = {start, len, seam, motion};
      if (!bestAny || seam < bestAny.seam) bestAny = cand;
      if (motion >= motionFloor && (!best || seam < best.seam)) best = cand;
    }
  }
  best ??= {...bestAny, starved: true};
  if (!best) throw Error('No loop window fits the clip length');
  const picked = Array.from({length: target}, (_, i) =>
    frames[best.start + Math.round((i * best.len) / target)]);
  return {...best, frames: picked};
}

/** Stage 4. The REJECT clauses of the one-shot prompt, made machine-checkable. */
export function gate(frames, source, {displacement = 0.10, cyclic = true} = {}) {
  const s0 = shape(source);
  const shapes = frames.map(shape);
  if (shapes.some(s => !s)) return {pass: false, checks: [{name: 'coverage', pass: false, detail: 'a frame matted to nothing'}]};
  const drift = Math.max(...shapes.map(s => Math.hypot(s.cx - s0.cx, s.cy - s0.cy))) / S;
  const areas = shapes.map(s => s.area / s0.area);
  const scale = Math.max(Math.max(...areas), 1 / Math.min(...areas)) - 1;
  const seam = frameDistance(frames[0], frames[frames.length - 1]);
  // A ping-pong cycle never closes on an identical frame - its endpoints are one step apart - so
  // the seam only has to be no worse than a typical step between consecutive frames.
  const steps = frames.slice(1).map((f, i) => frameDistance(frames[i], f)).sort((a, b) => a - b);
  const typicalStep = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  const seamBudget = cyclic ? 12 : Math.max(12, typicalStep * 1.5);
  const worst = Math.max(...frames.map(f => frameDistance(f, source)));
  const box = s => Math.min(s.box[0], s.box[1], S - s.box[2], S - s.box[3]);
  const edge = Math.min(...shapes.map(box));
  // Many emoji (meow_facepalm among them) already bleed to the canvas edge, so an
  // absolute margin is not a defect - only losing margin the source had is.
  const edgeBudget = Math.min(2, box(s0));
  const checks = [
    {name: 'subject drift', pass: drift <= displacement, detail: `${(drift * 100).toFixed(1)}% of canvas (budget ${(displacement * 100).toFixed(0)}%)`},
    {name: 'scale stability', pass: scale <= 0.15, detail: `${(scale * 100).toFixed(1)}% area swing (budget 15%)`},
    {name: 'loop seam', pass: seam <= seamBudget, detail: `${seam.toFixed(1)} mean channel delta (budget ${seamBudget.toFixed(1)}${cyclic ? '' : ', ping-pong: 1.5x typical step'})`},
    {name: 'gross departure', pass: worst <= 64, detail: `worst frame ${worst.toFixed(1)} from source (budget 64)`},
    {name: 'inside frame', pass: edge >= edgeBudget, detail: `${edge}px margin vs source's ${box(s0)}px`},
  ];
  return {
    pass: checks.every(c => c.pass),
    checks,
    // Measured on the meow_facepalm run: none of the above catch invented facial features.
    // Passing this gate means "geometrically sound", not "still the same character".
    unchecked: 'feature invention (added mouths, changed eyes) - needs a VLM or human look',
  };
}

const toRaw = file => sharp(file).resize(S, S).ensureAlpha().raw().toBuffer();

async function extractFrames(clip, dir) {
  await exec('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `scale=${S}:${S}`, '-y', path.join(dir, 'src-%03d.png')]);
  const files = (await fs.readdir(dir)).filter(f => f.startsWith('src-')).sort();
  return Promise.all(files.map(f => toRaw(path.join(dir, f))));
}

/** Builds a stand-in clip from the local tween so stages 2-5 can be exercised unpaid. */
async function simulateClip(name, dir) {
  const {render} = await import('./tween-meow-idea.mjs');
  const tweenDir = path.join(dir, 'tween');
  await render({source: `public/emojis/${name}.webp`, dir: tweenDir});
  // ffmpeg cannot decode animated WebP, so the clip is built from the tween's PNG frames.
  const hex = KEY.rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  const clip = path.join(dir, 'generated.mp4');
  await exec('ffmpeg', ['-v', 'error', '-stream_loop', '5', '-framerate', '24',
    '-i', path.join(tweenDir, 'frame-%02d.png'),
    '-f', 'lavfi', '-i', `color=c=0x${hex}:s=${S}x${S}`,
    '-filter_complex', '[1][0]overlay=shortest=1,format=yuv420p', '-y', clip]);
  return clip;
}

export async function run(name, {spend = false, simulate = false, target = 24, displacement = 0.10, prompt = ''} = {}) {
  const dir = `staging/replicate/${name}`;
  await fs.mkdir(dir, {recursive: true});
  const source = await toRaw(`public/emojis/${name}.webp`);
  const plate = await keyPlate(`public/emojis/${name}.webp`, path.join(dir, 'plate.png'));

  let clip;
  if (simulate) clip = await simulateClip(name, dir);
  else if (spend) {
    const plateURI = 'data:image/png;base64,' + (await fs.readFile(plate)).toString('base64');
    const r = await predict({dir, key: name, model: MODEL, input: generationInput({plateURI, prompt})});
    clip = path.join(dir, 'generated.mp4');
    await downloadPrediction(r, clip);
  } else throw Error('Stage 1 costs money: pass --spend to call Replicate, or --simulate to test stages 2-5');

  const raw = await extractFrames(clip, dir);
  const matted = temporalMedianAlpha(raw.map(f => unkey(f)));
  const loop = findLoop(matted, {target, max: Math.min(96, matted.length - 1)});
  const report = gate(loop.frames, source, {displacement});

  const files = [];
  for (const [i, f] of loop.frames.entries()) {
    const file = path.join(dir, `out-${String(i).padStart(2, '0')}.png`);
    await sharp(f, {raw: {width: S, height: S, channels: 4}}).png().toFile(file);
    files.push(file);
  }
  const out = path.join(dir, `${name}.webp`);
  await exec('img2webp', ['-loop', '0', '-lossy', '-q', '82', '-d', '70', ...files, '-o', out]);

  const result = {name, model: simulate ? 'simulated' : MODEL, clipFrames: raw.length, loop: {start: loop.start, len: loop.len, seam: +loop.seam.toFixed(2)}, frames: loop.frames.length, bytes: (await fs.stat(out)).size, gate: report};
  await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
  return {...result, out};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...flags] = process.argv.slice(2);
  const r = await run(name, {spend: flags.includes('--spend'), simulate: flags.includes('--simulate')});
  console.log(`${r.out} — ${r.frames} frames, ${(r.bytes / 1024).toFixed(1)}KB, seam ${r.loop.seam}`);
  for (const c of r.gate.checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
  console.log(r.gate.pass ? 'GATE PASS' : 'GATE FAIL');
}
