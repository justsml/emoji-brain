import {useMemo} from 'react';
import type {EmojiMetadata} from '../types/emoji';
import {bestTier, estimateTiers, type ExportTier, type TierEstimate} from '../lib/slackSizeEstimate';

export type ExportEstimates = {
  tiers: TierEstimate[];
  /** What a plain "Copy Slack script" would land on. */
  best?: TierEstimate;
  /** The tier the user pinned, if any, otherwise the automatic pick. */
  active?: TierEstimate;
  /** Total weight of the full-resolution sources, as the ZIP would carry them. */
  originalsBytes: number;
};

/**
 * Prices every tier for the current sheet. Both inputs are precomputed — the
 * uploader script's fixed weight is measured during the build, and the
 * per-image figures come from the catalog — so this is arithmetic over the
 * selection and nothing more, cheap enough to run on every click.
 */
export function useExportEstimates(emojis: EmojiMetadata[], overhead: number, pinned?: ExportTier | null): ExportEstimates {
  return useMemo(() => {
    // The ZIP stores already-compressed WebP, so the sources go in at face value.
    const originalsBytes = emojis.reduce((total, emoji) => total + (emoji.originalBytes ?? 0), 0);
    if (!emojis.length) return {tiers: [], originalsBytes};
    const tiers = estimateTiers(emojis, overhead);
    const best = bestTier(tiers);
    const active = pinned
      ? tiers.find(tier => tier.still === pinned.still && tier.animated === pinned.animated) ?? best
      : best;
    return {tiers, best, active, originalsBytes};
  }, [emojis, overhead, pinned]);
}
