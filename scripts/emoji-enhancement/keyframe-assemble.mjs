/**
 * Assembles generated keyframes into a looping animated WebP with real alpha.
 *
 * Keyframes come back on the chroma plate, each drawn independently, so they wobble: a few px
 * of translation and a few percent of scale between frames that should be locked. That wobble
 * is invisible in a contact sheet and glaring in a 64px loop, so every frame is re-registered
 * to the source's centroid and area before timing is applied.
 *
 * Timing is limited animation - hold each keyframe, cut to the next - which is what hand-drawn
 * 2D does and what flat-vector art survives. Cross-dissolving flat fills produces ghosting.
 * The cycle ping-pongs (1..N then N-1..2) so it closes with no seam by construction.
 *
 *   node scripts/emoji-enhancement/keyframe-assemble.mjs meow_facepalm gpt-image-2.5-chain
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import sharp from 'sharp';
import {unkey, temporalMedianAlpha, shape, gate} from './animate-replicate.mjs';
import {scaleAbout, over} from './tween-meow-idea.mjs';
import {identityCheck} from './identity-check.mjs';

const exec = promisify(execFile);
const S = 512;

/** Integer-shift an RGBA buffer; out-of-bounds becomes transparent. */
export function translate(src, dx, dy) {
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= S) continue;
    for (let x = 0; x < S; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= S) continue;
      src.copy(out, (y * S + x) * 4, (sy * S + sx) * 4, (sy * S + sx) * 4 + 4);
    }
  }
  return out;
}

/**
 * Re-registers frames onto the source's centroid and opaque area.
 *
 * The test that matters is deviation from the *group*, not from the source. A model that draws the
 * character consistently 13% small has reframed it - uniform, harmless, fully correctable. A model
 * whose frames disagree with each other is unstable, and rescaling would only disguise that. So the
 * correction is applied in full, and a frame is rejected only when its scale departs from the
 * group median by more than `tolerance`.
 */
export function registerAll(frames, ref, {tolerance = 0.08} = {}) {
  const r = shape(ref);
  const shapes = frames.map(shape);
  const ratios = shapes.map(f => (f && r ? Math.sqrt(r.area / f.area) : null));
  const valid = ratios.filter(v => v !== null).sort((a, b) => a - b);
  const median = valid.length ? valid[Math.floor(valid.length / 2)] : 1;

  return frames.map((frame, i) => {
    const f = shapes[i], ratio = ratios[i];
    if (!f || !r) return {frame, drift: null, scale: null, rejected: true};
    let out = frame;
    if (Math.abs(ratio - 1) > 0.004) out = scaleAbout(out, ratio, [f.cx, f.cy]);
    const g = shape(out) ?? f;
    out = translate(out, Math.round(r.cx - g.cx), Math.round(r.cy - g.cy));
    return {
      frame: out,
      drift: +Math.hypot(r.cx - f.cx, r.cy - f.cy).toFixed(1),
      scale: +ratio.toFixed(3),
      medianScale: +median.toFixed(3),
      rejected: Math.abs(ratio - median) > tolerance,
    };
  });
}

/** Ping-pong ordering: 0..n-1 then n-2..1. Closes the cycle without a matching end frame. */
export const pingPong = n => [...Array.from({length: n}, (_, i) => i), ...Array.from({length: Math.max(0, n - 2)}, (_, i) => n - 2 - i)];

export async function assemble(name, entrant, {hold = 3, delay = 60, keyframes} = {}) {
  const dir = `staging/keyframes/${name}/${entrant}`;
  const files = keyframes ?? (await fs.readdir(dir)).filter(f => /^k-\d+\.norm\.png$/.test(f)).sort().map(f => path.join(dir, f));
  if (!files.length) throw Error(`No keyframes in ${dir}`);

  const ref = await sharp(`public/emojis/${name}.webp`).resize(S, S).ensureAlpha().raw().toBuffer();
  const raw = await Promise.all(files.map(f => sharp(f).resize(S, S).ensureAlpha().raw().toBuffer()));
  const matted = temporalMedianAlpha(raw.map(f => unkey(f)));

  const reg = registerAll(matted, ref);
  const registered = reg.map(r => r.frame);
  const notes = reg.map((r, i) => ({keyframe: i, drift: r.drift, scale: r.scale, medianScale: r.medianScale, rejected: r.rejected}));

  const order = pingPong(registered.length);
  const out = path.join(dir, 'assembled');
  await fs.rm(out, {recursive: true, force: true});
  await fs.mkdir(out, {recursive: true});

  const png = [];
  for (const [i, k] of order.entries()) {
    // Flatten onto a transparent canvas so every emitted frame has identical premultiplication.
    const frame = over(Buffer.alloc(S * S * 4), registered[k]);
    const file = path.join(out, `f-${String(i).padStart(2, '0')}.png`);
    await sharp(frame, {raw: {width: S, height: S, channels: 4}}).png().toFile(file);
    png.push(file);
  }

  const webp = path.join(dir, `${name}.webp`);
  const delays = png.flatMap(() => Array(hold).fill(String(delay)));
  await exec('img2webp', ['-loop', '0', '-lossy', '-q', '82',
    ...png.flatMap((f, i) => ['-d', String(delay * hold), f]), '-o', webp]);

  const cycle = order.map(k => registered[k]);
  // Ping-pong: frame 0 and the final frame are one motion step apart by construction, never
  // identical, so the seam is judged against the typical step rather than against zero.
  const report = gate(cycle, ref, {displacement: 0.25, cyclic: false});
  const identity = await identityCheck({source: `public/emojis/${name}.webp`, frames: png.slice(0, 8), dir: out});

  const result = {name, entrant, keyframes: files.length, cycleFrames: order.length,
    holdMs: delay * hold, totalMs: order.length * delay * hold, registration: notes,
    gate: report, identity, bytes: (await fs.stat(webp)).size, webp};
  await fs.writeFile(path.join(dir, 'assembled.json'), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, entrant, hold = '3'] = process.argv.slice(2);
  const r = await assemble(name, entrant, {hold: Number(hold)});
  console.log(`${r.webp} — ${r.keyframes} keyframes -> ${r.cycleFrames} frames @ ${r.holdMs}ms (${r.totalMs}ms cycle), ${(r.bytes / 1024).toFixed(1)}KB`);
  console.log('registration:', r.registration.map(n => `k${n.keyframe} drift ${n.drift}px scale ${n.scale}${n.rejected ? ' REJECT' : ''}`).join(' | '),
    `(median scale ${r.registration[0]?.medianScale})`);
  for (const c of r.gate.checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
  console.log(`identity ${(r.identity.score * 100).toFixed(0)}% strict, ${(r.identity.characterRate * 100).toFixed(0)}% recognisable`);
}
