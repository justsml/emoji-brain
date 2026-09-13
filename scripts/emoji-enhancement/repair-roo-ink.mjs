/**
 * Repair black ink lost during the roo upscale pass.
 *
 * The upscaler recoloured solid-black fills (ears, eye patches, paws) to a mid
 * grey, and in a few cases dropped the shape entirely. The originals are the
 * ground truth: they use pure black ink, and the generated art is spatially
 * aligned with them (scale 1.0, offset 0, cream-mask IoU 0.81-0.96).
 *
 * So we use the original as a stencil. Where the original is solid black ink we
 * force the candidate back to black, and where the candidate also lost its alpha
 * we rebuild the shape from the stencil. The mask is eroded first so only region
 * interiors are touched - the generated art keeps its own crisp outlines.
 *
 * Writes candidates to staging/emoji-enhancements/stills/ink-repair/ for review.
 * Nothing is promoted; run promote-approved.mjs after sign-off.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ORIGINALS = 'staging/emoji-enhancements/originals';
const CANDIDATES = 'staging/emoji-enhancements/stills/candidates';
const OUT = 'staging/emoji-enhancements/stills/ink-repair';

/** Emoji whose black-ink coverage regressed against the original. */
export const TARGETS = [
  'roo-bot',
  'roo-nom',
  'roo-think',
  'roo-blank',
  'rooderp',
  'roo-rheee',
  'roo-ez',
  'roo-derp',
];

const INK_MAX = 70; // max channel value still counted as "black ink"
const OPAQUE = 140;
const ERODE_BLUR = 6; // ~3px erosion at 1024, keeps us off antialiased strokes

/**
 * Blur a binary mask and return a single-channel 0-255 ramp.
 * sharp widens a 1-channel raw buffer to 3 channels on blur, so we pin the
 * colourspace and still stride by the reported channel count - reading the
 * result as if it were 1 channel shears the mask.
 */
async function blurMask(mask, size, blur) {
  const grey = Buffer.alloc(size * size);
  for (let i = 0; i < mask.length; i++) grey[i] = mask[i] ? 255 : 0;
  const { data, info } = await sharp(grey, { raw: { width: size, height: size, channels: 1 } })
    .blur(blur)
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const out = Buffer.alloc(size * size);
  for (let i = 0; i < out.length; i++) out[i] = data[i * info.channels];
  return out;
}

/** Erode a binary mask by blurring and re-thresholding high. */
async function erode(mask, size, blur = ERODE_BLUR) {
  const blurred = await blurMask(mask, size, blur);
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = blurred[i] > 200 ? 1 : 0;
  return out;
}

/** Feather a binary mask into a 0-255 alpha ramp so rebuilt shapes aren't jagged. */
async function feather(mask, size, blur = 2) {
  return blurMask(mask, size, blur);
}

export async function repair(name) {
  const candidatePath = path.join(CANDIDATES, `${name}.webp`);
  const { data: cur, info } = await sharp(candidatePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const size = info.width;

  // Stencil: the original, resampled to the candidate's resolution.
  const orig = await sharp(path.join(ORIGINALS, `${name}.webp`))
    .ensureAlpha()
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  // The original's own ink colour, averaged - roo-bot inks in near-black navy,
  // not pure black, so we don't hardcode 0,0,0.
  let ir = 0, ig = 0, ib = 0, n = 0;
  const inkMask = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (orig[o + 3] < OPAQUE) continue;
    if (Math.max(orig[o], orig[o + 1], orig[o + 2]) >= INK_MAX) continue;
    inkMask[i] = 1;
    ir += orig[o]; ig += orig[o + 1]; ib += orig[o + 2]; n++;
  }
  if (!n) return { name, skipped: 'no ink in original' };
  const ink = [Math.round(ir / n), Math.round(ig / n), Math.round(ib / n)];

  const core = await erode(inkMask, size);

  // Split the work: recolour where the candidate still has a shape, rebuild
  // where it lost one. They need different alpha handling.
  const rebuilt = new Uint8Array(size * size);
  let recoloured = 0;
  for (let i = 0; i < size * size; i++) {
    if (!core[i]) continue;
    const c = i * 4;
    if (cur[c + 3] >= OPAQUE) {
      const mx = Math.max(cur[c], cur[c + 1], cur[c + 2]);
      if (mx < INK_MAX) continue; // already correct
      cur[c] = ink[0]; cur[c + 1] = ink[1]; cur[c + 2] = ink[2];
      recoloured++;
    } else {
      rebuilt[i] = 1;
    }
  }

  let rebuiltCount = 0;
  if (rebuilt.some(Boolean)) {
    const ramp = await feather(rebuilt, size);
    for (let i = 0; i < size * size; i++) {
      if (!ramp[i]) continue;
      const c = i * 4;
      if (cur[c + 3] >= OPAQUE) continue; // don't punch through existing art
      const a = Math.max(cur[c + 3], ramp[i]);
      cur[c] = ink[0]; cur[c + 1] = ink[1]; cur[c + 2] = ink[2]; cur[c + 3] = a;
      if (ramp[i] > 200) rebuiltCount++;
    }
  }

  // Stage 3: outlines. roo-rheee's whole line art came back tinted maroon. The
  // eroded core never touches strokes, so neutralise chroma on any dark pixel
  // the original draws in black, keeping the candidate's luminance so the
  // antialiasing stays crisp. Coloured art (the tongue) isn't black in the
  // original, so it's outside the mask and keeps its hue.
  // Only when the original's own ink is neutral. roo-bot inks in navy by
  // design, so desaturating it there would be the bug, not the fix.
  const inkIsNeutral = Math.max(...ink) - Math.min(...ink) <= 12;
  let neutralised = 0;
  for (let i = 0; inkIsNeutral && i < size * size; i++) {
    if (!inkMask[i]) continue;
    const c = i * 4;
    if (cur[c + 3] < OPAQUE) continue;
    const r = cur[c], g = cur[c + 1], b = cur[c + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 150 || mx - mn <= 12) continue;
    const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    cur[c] = luma; cur[c + 1] = luma; cur[c + 2] = luma;
    neutralised++;
  }

  await fs.mkdir(OUT, { recursive: true });
  const outPath = path.join(OUT, `${name}.webp`);
  await sharp(cur, { raw: info }).webp({ lossless: true }).toFile(outPath);
  return { name, ink, recoloured, rebuilt: rebuiltCount, neutralised, out: outPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : TARGETS;
  for (const name of names) console.log(JSON.stringify(await repair(name)));
}
