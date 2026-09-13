import sharp from 'sharp';

const BLUE = [69, 174, 230];
const YELLOW = [250, 195, 27];
// Flat fills the upscaler produced, which we replace with the ramp.
const FLAT_BLUE = [76, 170, 220];
const FLAT_YELLOW = [246, 192, 30];
// Gradient start/end as a fraction of the body's vertical extent (measured
// from the 128px original).
const RAMP_START = 0.09;
const RAMP_END = 0.60;

const dist = (d, o, c) =>
  Math.hypot(d[o] - c[0], d[o + 1] - c[1], d[o + 2] - c[2]);

const smoothstep = (t) => t * t * (3 - 2 * t);

export async function fixGradient(input, output, hueShift = null) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // Body bbox: every pixel the upscaler filled with one of the two flat tones.
  let top = H;
  let bottom = 0;
  const isBody = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      if (data[o + 3] < 40) continue;
      const d = Math.min(dist(data, o, FLAT_BLUE), dist(data, o, FLAT_YELLOW));
      if (d < 60) {
        isBody[i] = 1;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  const span = bottom - top;
  const from = hueShift ? hueShift.from : BLUE;
  const to = hueShift ? hueShift.to : YELLOW;

  for (let y = top; y <= bottom; y++) {
    const p = (y - top) / span;
    const t = smoothstep(
      Math.min(1, Math.max(0, (p - RAMP_START) / (RAMP_END - RAMP_START))),
    );
    const r = from[0] + (to[0] - from[0]) * t;
    const g = from[1] + (to[1] - from[1]) * t;
    const b = from[2] + (to[2] - from[2]) * t;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isBody[i]) continue;
      const o = i * 4;
      // Feather by how close the pixel was to a pure flat tone, so
      // anti-aliased borders against the glasses/tie stay put.
      const d = Math.min(dist(data, o, FLAT_BLUE), dist(data, o, FLAT_YELLOW));
      const w = 1 - smoothstep(Math.min(1, Math.max(0, (d - 20) / 40)));
      data[o] = Math.round(data[o] + (r - data[o]) * w);
      data[o + 1] = Math.round(data[o + 1] + (g - data[o + 1]) * w);
      data[o + 2] = Math.round(data[o + 2] + (b - data[o + 2]) * w);
    }
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 92 })
    .toFile(output);
  return { W, H, top, bottom };
}

if (process.argv[2]) {
  console.log(await fixGradient(process.argv[2], process.argv[3]));
}
