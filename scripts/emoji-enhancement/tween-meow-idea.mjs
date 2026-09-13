/**
 * Tweening pilot: meow_idea "subtle" bulb flicker, 8 frames @ 120ms.
 *
 * No generative model. The still is split into three raster layers by geometry
 * (the bulb rays are a single connected component with the glass, so they are cut
 * by column, measured from the alpha profile), then each frame composites the
 * layers with per-layer alpha and scale about the bulb centre. The cat never moves
 * and is never resampled, so identity drift is structurally impossible.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import sharp from 'sharp';

const exec = promisify(execFile);
const S = 512;

/** Measured from the alpha profile of meow_idea.webp at 512px. */
export const RIG = {
  split: 168,        // transparent gutter between bulb group and cat
  coreLeft: 220,     // glass + screw base column span; outside it is rays
  coreRight: 288,
  centre: [252, 82], // bulb glass centroid — rays scale about this
};

/** 8-frame two-step flicker. alpha = ray opacity, scale = ray scale, glow = glass RGB gain. */
export const FLICKER = [
  {alpha: 1.00, scale: 1.06, glow: 1.00},
  {alpha: 1.00, scale: 1.04, glow: 1.00},
  {alpha: 0.35, scale: 0.96, glow: 0.92},
  {alpha: 0.70, scale: 1.00, glow: 0.96},
  {alpha: 1.00, scale: 1.06, glow: 1.00},
  {alpha: 0.30, scale: 0.95, glow: 0.91},
  {alpha: 0.40, scale: 0.97, glow: 0.93},
  {alpha: 0.75, scale: 1.02, glow: 0.97},
];

const idx = (x, y) => (y * S + x) * 4;

/** Copies pixels matching `keep(x,y)` into a fresh transparent S×S RGBA buffer. */
export function layer(src, keep) {
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!keep(x, y)) continue;
    const i = idx(x, y);
    src.copy(out, i, i, i + 4);
  }
  return out;
}

/** Bilinear scale about `[cx,cy]`, sampling straight-alpha source. Out-of-bounds is transparent. */
export function scaleAbout(src, s, [cx, cy]) {
  if (s === 1) return Buffer.from(src);
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = (x - cx) / s + cx, sy = (y - cy) / s + cy;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= S || y0 + 1 >= S) continue;
    const fx = sx - x0, fy = sy - y0;
    const o = idx(x, y);
    for (let c = 0; c < 4; c++) {
      const p00 = src[idx(x0, y0) + c], p10 = src[idx(x0 + 1, y0) + c];
      const p01 = src[idx(x0, y0 + 1) + c], p11 = src[idx(x0 + 1, y0 + 1) + c];
      out[o + c] = Math.round(
        p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy,
      );
    }
  }
  return out;
}

/** Straight-alpha source-over of `top` onto `base`, with `top` alpha scaled by `opacity`. */
export function over(base, top, opacity = 1) {
  for (let i = 0; i < base.length; i += 4) {
    const ta = (top[i + 3] / 255) * opacity;
    if (ta <= 0) continue;
    const ba = base[i + 3] / 255;
    const oa = ta + ba * (1 - ta);
    for (let c = 0; c < 3; c++) base[i + c] = Math.round((top[i + c] * ta + base[i + c] * ba * (1 - ta)) / oa);
    base[i + 3] = Math.round(oa * 255);
  }
  return base;
}

/** Multiplies RGB toward/away from the source colour, leaving alpha untouched. */
export function gain(buf, g) {
  if (g === 1) return buf;
  for (let i = 0; i < buf.length; i += 4) {
    if (!buf[i + 3]) continue;
    for (let c = 0; c < 3; c++) buf[i + c] = Math.min(255, Math.round(buf[i + c] * g));
  }
  return buf;
}

export async function render({source = 'public/emojis/meow_idea.webp', dir, delay = 120} = {}) {
  await fs.mkdir(dir, {recursive: true});
  const {data} = await sharp(source).resize(S, S).ensureAlpha().raw().toBuffer({resolveWithObject: true});

  const cat = layer(data, (_x, y) => y >= RIG.split);
  const core = layer(data, (x, y) => y < RIG.split && x >= RIG.coreLeft && x <= RIG.coreRight);
  const rays = layer(data, (x, y) => y < RIG.split && (x < RIG.coreLeft || x > RIG.coreRight));

  const files = [];
  for (const [n, f] of FLICKER.entries()) {
    const frame = Buffer.alloc(S * S * 4);
    over(frame, cat);
    over(frame, gain(Buffer.from(core), f.glow));
    over(frame, scaleAbout(rays, f.scale, RIG.centre), f.alpha);
    const file = path.join(dir, `frame-${String(n).padStart(2, '0')}.png`);
    await sharp(frame, {raw: {width: S, height: S, channels: 4}}).png().toFile(file);
    files.push(file);
  }

  const out = path.join(dir, 'meow_idea.webp');
  await exec('img2webp', ['-loop', '0', '-lossy', '-q', '82', '-d', String(delay), ...files, '-o', out]);
  const {size} = await fs.stat(out);
  return {out, frames: files.length, delay, bytes: size};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await render({dir: process.argv[2] ?? 'staging/tween/meow_idea'});
  console.log(`${r.out} — ${r.frames} frames @ ${r.delay}ms, ${(r.bytes / 1024).toFixed(1)}KB`);
}
