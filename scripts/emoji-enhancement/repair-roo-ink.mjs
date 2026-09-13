/**
 * Repair black ink lost during the roo upscale pass.
 *
 * The upscaler recoloured solid-black fills - ears, eye patches, paws - to a mid
 * grey, and on roo-rheee tinted the line art maroon. rooderp lost its ears
 * outright.
 *
 * Approach: recolour whole REGIONS, never loose pixels. An earlier version
 * masked against the original and recoloured only the eroded core of each ink
 * area, which left every ear half black and half grey - mottled blotches, and a
 * smudge around one eye that read as a black eye. The candidate's own art has
 * clean flat fills and crisp outlines, so we segment it into connected regions
 * of suspect grey, then use the original only to VOTE on each region: if the
 * area it covers is predominantly black in the original, the whole region gets
 * filled with the original's ink colour. The suit is legitimately grey in the
 * original, so it votes grey and is left alone.
 *
 * Regions the candidate dropped entirely (rooderp's ears) can't be voted on, so
 * they're rebuilt from the original: hard-thresholded after a smooth upscale to
 * get a crisp silhouette rather than a blurry 112px blob.
 *
 * Writes to staging/emoji-enhancements/stills/ink-repair/ for review.
 * Nothing is promoted; run promote-approved.mjs after sign-off.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ORIGINALS = 'staging/emoji-enhancements/originals';
const CANDIDATES = 'staging/emoji-enhancements/stills/candidates';
const OUT = 'staging/emoji-enhancements/stills/ink-repair';

/**
 * Emoji whose black ink regressed against the original.
 * roo-bot is deliberately absent: it inks in dark navy, so a naive
 * "how much pure black is left" check flags it at 93% loss, but it is correct.
 */
export const TARGETS = [
  'roo-nom',
  'roo-think',
  'roo-blank',
  'rooderp',
  'roo-rheee',
  'roo-ez',
  'roo-derp',
];

const OPAQUE = 140;
const INK_MAX = 70; // max channel still counted as black ink in the original
const SUSPECT = { chroma: 26, lo: 55, hi: 190 }; // flat grey that should be ink
const VOTE = 0.5; // region is ink if this fraction of it is black in the original
const SILHOUETTE_DILATE = 3; // blur radius when rebuilding alpha, keeps strokes from clipping
const RING = 4; // px offset sampled around an exposed region to pick its fill colour

/** Candidates whose matte is unusable and must be rebuilt from the original. See stage 0. */
const MATTE_REBUILD = new Set(['roo-think']);

/** The flat fill colours an emoji is actually drawn with, most used first. */
function dominantColours(buf, size, max = 6) {
  const votes = new Map();
  for (let i = 0; i < size * size; i++) {
    const c = i * 4;
    if (buf[c + 3] < 200) continue;
    const k = `${buf[c] >> 3 << 3},${buf[c + 1] >> 3 << 3},${buf[c + 2] >> 3 << 3}`;
    votes.set(k, (votes.get(k) || 0) + 1);
  }
  const min = 0.01 * size * size;
  return [...votes]
    .filter(([, v]) => v >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k.split(',').map(Number));
}

/** Label 4-connected regions of a binary mask. Returns arrays of pixel indices. */
function components(mask, size) {
  const label = new Int32Array(size * size).fill(-1);
  const stack = new Int32Array(size * size);
  const out = [];
  for (let seed = 0; seed < size * size; seed++) {
    if (!mask[seed] || label[seed] >= 0) continue;
    let sp = 0;
    stack[sp++] = seed;
    label[seed] = out.length;
    const px = [];
    while (sp) {
      const p = stack[--sp];
      px.push(p);
      const x = p % size, y = (p / size) | 0;
      if (x + 1 < size) { const q = p + 1; if (mask[q] && label[q] < 0) { label[q] = out.length; stack[sp++] = q; } }
      if (x > 0) { const q = p - 1; if (mask[q] && label[q] < 0) { label[q] = out.length; stack[sp++] = q; } }
      if (y + 1 < size) { const q = p + size; if (mask[q] && label[q] < 0) { label[q] = out.length; stack[sp++] = q; } }
      if (y > 0) { const q = p - size; if (mask[q] && label[q] < 0) { label[q] = out.length; stack[sp++] = q; } }
    }
    out.push(px);
  }
  return out;
}

/** Blur a binary mask to a 0-255 ramp. sharp widens 1-channel raw on blur, so stride by the reported channels. */
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

export async function repair(name, { minRegion = 1500 } = {}) {
  const { data: cur, info } = await sharp(path.join(CANDIDATES, `${name}.webp`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const size = info.width;

  // Two upscales of the original, for two different jobs.
  // NEAREST for classifying colour: it keeps the flat fills flat. A smooth
  // upscale blends the black outlines into the grey body across a wide band,
  // landing those pixels in the 50-75 range, which reads as "ink" and makes the
  // region votes below call the torso black.
  // SMOOTH for the silhouette: a nearest-upscaled alpha gives a blocky,
  // stair-stepped edge when the matte is rebuilt from it.
  const orig = await sharp(path.join(ORIGINALS, `${name}.webp`))
    .ensureAlpha()
    .resize(size, size, { fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer();
  const origSmooth = await sharp(path.join(ORIGINALS, `${name}.webp`))
    .ensureAlpha()
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  // The original's ink colour and ink mask.
  let ir = 0, ig = 0, ib = 0, n = 0;
  const origInk = new Uint8Array(size * size);
  const origGrey = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (orig[o + 3] < OPAQUE) continue;
    const mx = Math.max(orig[o], orig[o + 1], orig[o + 2]);
    if (mx < INK_MAX) { origInk[i] = 1; ir += orig[o]; ig += orig[o + 1]; ib += orig[o + 2]; n++; }
    else if (mx < 200) origGrey[i] = 1;
  }
  if (!n) return { name, skipped: 'no ink in original' };
  const ink = [Math.round(ir / n), Math.round(ig / n), Math.round(ib / n)];
  const inkIsNeutral = Math.max(...ink) - Math.min(...ink) <= 12;

  // Stage 0: matte rebuild, for candidates generated over a BLACK background.
  // Because the line art is black too, the matte couldn't separate them and kept
  // a whole block of background as opaque art, leaving the arm semi-transparent
  // where it did try to cut. Cutting just the offending pixels doesn't work: the
  // residue is contiguous with the real outline, so it either leaves the block
  // or punches pinholes through the linework. The only reliable authority is the
  // original's silhouette - dilated slightly so strokes aren't clipped,
  // hard-thresholded for a crisp edge, one pixel of feather.
  //
  // This is opt-in per emoji and must stay that way. Every automatic trigger
  // tried (how much art sits outside the silhouette, how far out it sits,
  // whether it touches the frame edge) also fires on candidates whose matte is
  // fine but whose art is simply drawn a little larger than the original - and
  // on those, replacing the matte clips the ears and erodes the outline.
  const origAlpha = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) origAlpha[i] = origSmooth[i * 4 + 3] >= OPAQUE ? 1 : 0;

  let alphaRebuilt = 0, recoloured = 0;
  if (MATTE_REBUILD.has(name)) {
    const ramp = await blurMask(origAlpha, size, SILHOUETTE_DILATE);
    const exposed = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const c = i * 4;
      const was = cur[c + 3];
      const now = ramp[i] >= 110 ? 255
        : ramp[i] < 70 ? 0
        : Math.round((ramp[i] - 70) * (255 / 40));
      cur[c + 3] = now;
      // A pixel that was transparent carries whatever RGB the matte left behind
      // - leftover chroma-key green, or black background. Turning it opaque
      // exposes that, so these need a colour of their own.
      if (now > 0 && was < 15) exposed[i] = 1;
    }

    // Fill each exposed region with ONE flat colour sampled from the art ringing
    // it. Copying the upscaled original's pixels here instead left a blurry,
    // slightly-off patch butted against crisp flat art - it read as an inset
    // cutout under roo-think's chin. The art is flat-coloured, so a single
    // modal colour per region rejoins it seamlessly.
    for (const px of components(exposed, size)) {
      // Ask the original what this region IS before asking the neighbours what
      // colour to use. Filling purely by neighbour vote flips between two bad
      // outcomes: count ink and the enclosing outline wins, flooding the torso
      // black; skip ink and the outline under the chin becomes grey, merging
      // regions so stage 1 re-votes the whole torso black anyway.
      let inkHere = 0;
      for (const p of px) if (origInk[p]) inkHere++;
      if (inkHere > 0.5 * px.length) {
        for (const p of px) {
          const c = p * 4;
          cur[c] = ink[0]; cur[c + 1] = ink[1]; cur[c + 2] = ink[2];
        }
        recoloured += px.length;
        continue;
      }
      const votes = new Map();
      for (const p of px) {
        const x = p % size, y = (p / size) | 0;
        for (let dy = -RING; dy <= RING; dy += RING) {
          for (let dx = -RING; dx <= RING; dx += RING) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const q = ny * size + nx;
            if (exposed[q] || cur[q * 4 + 3] < OPAQUE) continue;
            // Skip ink. These regions are body, and every one of them is ringed
            // by the outline that encloses it, so counting ink wins the vote and
            // fills the torso solid black - the arm then reads as fading into a
            // black mass instead of sitting on grey.
            if (Math.max(cur[q * 4], cur[q * 4 + 1], cur[q * 4 + 2]) < INK_MAX) continue;
            const k = `${cur[q * 4] >> 4},${cur[q * 4 + 1] >> 4},${cur[q * 4 + 2] >> 4}`;
            votes.set(k, (votes.get(k) || 0) + 1);
          }
        }
      }
      if (!votes.size) continue;
      const [best] = [...votes].sort((a, b) => b[1] - a[1])[0];
      const rgb = best.split(',').map((v) => Math.min(255, (Number(v) << 4) + 8));
      for (const p of px) {
        const c = p * 4;
        cur[c] = rgb[0]; cur[c + 1] = rgb[1]; cur[c + 2] = rgb[2];
      }
      recoloured += px.length;
    }
    alphaRebuilt = 1;
  }

  // Stage 1: regions of suspect flat grey in the candidate.
  const suspect = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const c = i * 4;
    if (cur[c + 3] < OPAQUE) continue;
    const mx = Math.max(cur[c], cur[c + 1], cur[c + 2]);
    const mn = Math.min(cur[c], cur[c + 1], cur[c + 2]);
    if (mx - mn <= SUSPECT.chroma && mx >= SUSPECT.lo && mx <= SUSPECT.hi) suspect[i] = 1;
  }

  const regions = components(suspect, size);
  const filled = [];
  for (const px of regions) {
    if (px.length < minRegion) continue;
    let black = 0, grey = 0;
    for (const p of px) { if (origInk[p]) black++; else if (origGrey[p]) grey++; }
    if (black < VOTE * px.length || black <= grey) continue;
    for (const p of px) {
      const c = p * 4;
      cur[c] = ink[0]; cur[c + 1] = ink[1]; cur[c + 2] = ink[2];
    }
    filled.push({ px: px.length, black: +(black / px.length).toFixed(2) });
  }

  // Stage 2: ink the original has that the candidate has no shape for at all.
  // Vote per region so we only rebuild wholly-missing features, not the seams
  // where the candidate simply drew an edge in a slightly different place.
  const missing = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    if (!origInk[i]) continue;
    const c = i * 4;
    const mx = Math.max(cur[c], cur[c + 1], cur[c + 2]);
    if (cur[c + 3] < OPAQUE || mx > SUSPECT.hi) missing[i] = 1;
  }
  let rebuilt = 0;
  const keep = new Uint8Array(size * size);
  for (const px of components(missing, size)) {
    if (px.length < minRegion * 3) continue; // whole features only
    let transparent = 0;
    for (const p of px) if (cur[p * 4 + 3] < OPAQUE) transparent++;
    if (transparent < 0.6 * px.length) continue;
    for (const p of px) keep[p] = 1;
    rebuilt += px.length;
  }
  if (rebuilt) {
    // Hard threshold a smoothed mask for a crisp edge, then feather 1px.
    const ramp = await blurMask(keep, size, 1.2);
    for (let i = 0; i < size * size; i++) {
      const a = ramp[i] > 128 ? 255 : ramp[i] > 60 ? ramp[i] * 2 : 0;
      if (!a) continue;
      const c = i * 4;
      if (cur[c + 3] >= OPAQUE) continue;
      cur[c] = ink[0]; cur[c + 1] = ink[1]; cur[c + 2] = ink[2];
      cur[c + 3] = Math.max(cur[c + 3], Math.min(255, a));
    }
  }

  // Stage 3: outlines tinted off-neutral (roo-rheee's maroon line art). Keep the
  // candidate's luminance so antialiasing survives; skip when the original's own
  // ink is chromatic.
  let neutralised = 0;
  for (let i = 0; inkIsNeutral && i < size * size; i++) {
    if (!origInk[i]) continue;
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
  return { name, ink, alphaRebuilt, recoloured, regions: filled, rebuilt, neutralised, out: outPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : TARGETS;
  for (const name of names) console.log(JSON.stringify(await repair(name)));
}
