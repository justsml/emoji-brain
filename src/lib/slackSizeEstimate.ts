/* ---------------------------------------------------------------------------
   What a Slack export will weigh, before a single image is downloaded.

   The planner walks this same ladder and measures the real script; these
   figures only decide what to *show* the user and which tiers are worth
   attempting. Both sides import EXPORT_TIERS so the offer in the UI and the
   plan that runs can never drift apart.
   --------------------------------------------------------------------------- */

export const SLACK_SCRIPT_LIMIT = 8_000_000;

/** Still/animated pairs, largest first. Animations cost far more per pixel. */
export const EXPORT_TIERS = [
  {still: 256, animated: 128},
  {still: 256, animated: 64},
  {still: 128, animated: 64},
  {still: 64, animated: 64},
] as const;

export type ExportTier = {still: number; animated: number};

/**
 * The fields the estimator needs; `gzip` is keyed by pixel size.
 * `maxSlackSize` is the catalog's recorded ceiling for this image — the largest
 * variant inside Slack's per-emoji cap.
 */
export type SizedEmoji = {animated?: boolean; gzip?: Record<string, number>; maxSlackSize?: number};

/**
 * The size an image ships at: the tier, unless Slack's per-emoji cap forces
 * this particular one smaller. Shared with the planner so the figures shown
 * and the images sent can never disagree.
 */
export function slackSizeFor(emoji: {animated?: boolean; maxSlackSize?: number}, tierSize: number): number {
  return emoji.maxSlackSize ? Math.min(tierSize, emoji.maxSlackSize) : tierSize;
}

export type TierEstimate = ExportTier & {
  stillCount: number;
  animatedCount: number;
  /** Estimated bytes of the finished script, base64 and overhead included. */
  bytes: number;
  fits: boolean;
  /** False when the catalog had no stored figure for some image. */
  measured: boolean;
};

/**
 * Mirrors the planner: images are gzipped as one payload, then base64'd (4
 * bytes out per 3 in) and dropped into the uploader script.
 */
export function estimateTierBytes(emojis: SizedEmoji[], tier: ExportTier, overheadBytes: number): {bytes: number; measured: boolean} {
  let payload = 0;
  let measured = true;
  for (const emoji of emojis) {
    const size = slackSizeFor(emoji, emoji.animated ? tier.animated : tier.still);
    const gzip = emoji.gzip?.[String(size)];
    if (Number.isFinite(gzip)) payload += gzip as number;
    else measured = false;
  }
  return {bytes: 4 * Math.ceil(payload / 3) + overheadBytes, measured};
}

/**
 * One row per distinct outcome. A selection of only stills (or only
 * animations) collapses tiers that would produce identical images, so the user
 * is never offered the same export twice under two names.
 */
export function estimateTiers(
  emojis: SizedEmoji[],
  overheadBytes: number,
  limit = SLACK_SCRIPT_LIMIT,
): TierEstimate[] {
  const stillCount = emojis.filter(emoji => !emoji.animated).length;
  const animatedCount = emojis.length - stillCount;
  const seen = new Set<string>();
  const rows: TierEstimate[] = [];
  for (const tier of EXPORT_TIERS) {
    const key = `${stillCount ? tier.still : '-'}/${animatedCount ? tier.animated : '-'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const {bytes, measured} = estimateTierBytes(emojis, tier, overheadBytes);
    rows.push({...tier, stillCount, animatedCount, bytes, fits: bytes < limit, measured});
  }
  return rows;
}

/** The tier the planner would land on: the largest one expected to fit. */
export function bestTier(estimates: TierEstimate[]): TierEstimate | undefined {
  return estimates.find(estimate => estimate.fits) ?? estimates[estimates.length - 1];
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    const megabytes = (bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1);
    return `${megabytes.replace(/\.0$/, '')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString()} KB`;
}
