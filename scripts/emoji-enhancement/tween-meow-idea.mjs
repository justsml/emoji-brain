/**
 * Tweening pilot: meow_idea "subtle" bulb flicker, 8 frames @ 120ms.
 *
 * No generative model. The still is split into two raster layers at the one place the
 * artwork can be cut without damage: rows 168-170 are completely empty, separating the
 * bulb group from the cat. Each frame re-composites the bulb with a scale and brightness
 * pulse about its centroid. The cat is copied, never resampled, so identity drift is
 * structurally impossible.
 *
 * An earlier version also split the bulb's rays from its glass at fixed columns. That was
 * wrong: the rays are one connected component with the glass (they meet its outline, and
 * stay fused even at alpha>240), so the column cut sliced through solid artwork and the
 * severed edges showed up as straight vertical lines whenever the rays moved. The bulb is
 * now animated as a single unit - there is no interior cut to expose.
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
  split: 168,        // rows 168-170 are fully transparent: the only lossless cut in this artwork
  centre: [252, 82], // bulb glass centroid - the bulb group scales about this
};

/**
 * 8-frame two-step flicker of the whole bulb group. `scale` and `glow` only: fading the group's
 * alpha would read as the bulb vanishing rather than dimming, and there is no sub-layer to fade
 * independently without cutting the artwork.
 */
export const FLICKER = [
  {scale: 1.05, glow: 1.06},
  {scale: 1.04, glow: 1.04},
  {scale: 0.97, glow: 0.90},
  {scale: 1.00, glow: 0.96},
  {scale: 1.05, glow: 1.06},
  {scale: 0.96, glow: 0.88},
  {scale: 0.98, glow: 0.92},
  {scale: 1.02, glow: 1.00},
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
  const bulb = layer(data, (_x, y) => y < RIG.split);

  const files = [];
  for (const [n, f] of FLICKER.entries()) {
    const frame = Buffer.alloc(S * S * 4);
    over(frame, cat);
    over(frame, gain(scaleAbout(bulb, f.scale, RIG.centre), f.glow));
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
