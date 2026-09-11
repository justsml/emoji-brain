import sharp from 'sharp';

/**
 * Mean per-pixel alpha deviation of an encoded animation from its source, at
 * the worst frame, in 0–255 units.
 *
 * Frames are walked on the source's timeline because the encoder may
 * losslessly coalesce a held frame into a longer one, so output frame N does
 * not necessarily correspond to source frame N.
 *
 * Encoding is not monotonic in quality: some images come out with worse alpha
 * at 85 than at 80. Size alone is therefore not enough to choose an encode —
 * the generator asks for this figure too, so it cannot emit a variant the
 * delivery validator would reject.
 */
export async function maxMeanAlphaError(source, output, size, kernel = 'lanczos3') {
  const original = await sharp(source, {animated: true}).metadata();
  const meta = await sharp(output, {animated: true}).metadata();
  let reference = sharp(source, {animated: true});
  if (size !== 'original') reference = reference.resize(size, size, {fit: 'contain', background: '#00000000', kernel});
  const expected = await reference.ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const actual = await sharp(output, {animated: true}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const pixels = meta.width * (meta.pageHeight ?? meta.height);
  let targetFrame = 0, targetEnd = meta.delay?.[0] ?? Infinity, time = 0, worst = 0;
  for (let frame = 0; frame < (original.pages ?? 1); frame++) {
    while (time >= targetEnd && targetFrame < (meta.pages ?? 1) - 1) targetEnd += meta.delay[++targetFrame];
    let error = 0;
    for (let p = 0; p < pixels; p++) error += Math.abs(expected[frame * pixels + p] - actual[targetFrame * pixels + p]);
    worst = Math.max(worst, error / pixels);
    time += original.delay?.[frame] ?? 0;
  }
  return worst;
}
