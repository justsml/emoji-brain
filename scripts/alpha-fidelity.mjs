import sharp from 'sharp';

/** Alpha channel of a raw RGBA frame strip, without re-decoding the image. */
export function alphaFromRaw(rgba) {
  const alpha = Buffer.alloc(rgba.length / 4);
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = rgba[p];
  return alpha;
}

/**
 * Mean per-pixel alpha deviation of an encoded animation from the animation it
 * was meant to be, at the worst frame, in 0–255 units.
 *
 * The reference is the intended frame sequence — already resized, and already
 * frame-dropped where that applies — rather than the original artwork, so a
 * deliberately dropped frame is never counted as damage. Frames are matched on
 * the timeline because the encoder may losslessly coalesce a held frame into a
 * longer one, so output frame N need not be reference frame N.
 *
 * Encoding is not monotonic in quality: some images come out with worse alpha
 * at 85 than at 80. Size alone is therefore not enough to choose an encode —
 * the generator asks for this figure too, so it cannot emit a variant the
 * delivery validator would reject.
 */
export async function maxMeanAlphaError(expectedAlpha, expectedDelays, output) {
  const meta = await sharp(output, {animated: true}).metadata();
  const actual = await sharp(output, {animated: true}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const pixels = meta.width * (meta.pageHeight ?? meta.height);
  let targetFrame = 0, targetEnd = meta.delay?.[0] ?? Infinity, time = 0, worst = 0;
  for (let frame = 0; frame < expectedDelays.length; frame++) {
    while (time >= targetEnd && targetFrame < (meta.pages ?? 1) - 1) targetEnd += meta.delay[++targetFrame];
    let error = 0;
    for (let p = 0; p < pixels; p++) error += Math.abs(expectedAlpha[frame * pixels + p] - actual[targetFrame * pixels + p]);
    worst = Math.max(worst, error / pixels);
    time += expectedDelays[frame] ?? 0;
  }
  return worst;
}
