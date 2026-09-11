/**
 * Slack refuses a custom emoji over `slackTargetBytes` (128 KB), so the largest
 * variant that fits is a property of the catalog, not something each exporter
 * should rediscover. Stills comfortably fit at every size; some animations do
 * not fit at any, and `null` says so plainly rather than leaving a caller to
 * ship an upload that is certain to be rejected.
 */
export const SLACK_VARIANT_SIZES = [256, 128, 64, 32];

export function highestSlackCompatible(variants, cap) {
  for (const size of SLACK_VARIANT_SIZES) {
    const asset = variants[size]?.webp;
    if (asset && asset.bytes <= cap) return {size, path: asset.path, bytes: asset.bytes};
  }
  return null;
}
