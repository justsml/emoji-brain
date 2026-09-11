/**
 * Dropping frames to fit Slack's per-emoji cap.
 *
 * The catalog's animations were captured at 39–50 fps, far more motion than a
 * 64px emoji renders, and frame count — not quality — is what pushes the long
 * ones over the cap. Spending those redundant frames buys back enough bytes to
 * keep the artwork at 90 quality, and often at a larger canvas.
 *
 * The generator and the delivery validator both derive the surviving frames
 * from this one function, so a variant can always be checked against the exact
 * animation it was meant to be.
 */

/** Tried in order; the first that fits wins, so most animations keep every frame. */
export const FRAME_KEEP_LADDER = [1, 0.75, 0.6, 0.5, 0.4, 0.33];

/** Below this the loop reads as a slideshow, whatever it saves. */
export const MIN_FPS = 12;

/**
 * A uniform subset of frames, with each dropped frame's delay folded into the
 * frame that now covers its place on the timeline. Total duration is therefore
 * unchanged: the loop plays at the same speed, in fewer steps.
 */
export function pickFrames(pages, delays, keep) {
  const target = Math.max(2, Math.round(pages * keep));
  const chosen = [];
  for (let i = 0; i < target; i++) chosen.push(Math.min(pages - 1, Math.round(i * pages / target)));
  const frames = [...new Set(chosen)];
  const folded = frames.map((frame, i) => {
    const next = i + 1 < frames.length ? frames[i + 1] : pages;
    let delay = 0;
    for (let f = frame; f < next; f++) delay += delays[f] ?? 0;
    return delay;
  });
  return {frames, delays: folded};
}

/** The ladder rungs this animation may use, stopping before MIN_FPS. */
export function allowedKeeps(pages, delays) {
  if (pages < 2) return [1];
  const seconds = delays.reduce((a, b) => a + b, 0) / 1000;
  if (!seconds) return [1];
  return FRAME_KEEP_LADDER.filter(keep => keep === 1 || pickFrames(pages, delays, keep).frames.length / seconds >= MIN_FPS);
}

/** Reorder a raw RGBA frame strip to contain only the kept frames. */
export function stripFrames(data, frames, pageBytes) {
  const out = Buffer.alloc(pageBytes * frames.length);
  frames.forEach((frame, i) => data.copy(out, i * pageBytes, frame * pageBytes, (frame + 1) * pageBytes));
  return out;
}
