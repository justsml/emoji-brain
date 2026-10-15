import {Check, Download, TriangleAlert} from "lucide-react";
import type {ExportEstimates} from "../hooks/useExportEstimates";
import {formatBytes, SLACK_SCRIPT_LIMIT, type ExportTier, type TierEstimate} from "../lib/slackSizeEstimate";

interface ExportOptionsProps {
  id: string;
  estimates: ExportEstimates;
  /** null means "let the planner choose". */
  pinnedTier: ExportTier | null;
  onPinTier: (tier: ExportTier | null) => void;
  onRun: (action: () => void | Promise<void>) => void;
  /** `primary` is the one action the card exists for; the rest are alternatives. */
  formats: {label: string; run: () => void | Promise<void>; primary?: boolean}[];
  /** Downloads the full-resolution sources; they are far too big to paste. */
  onDownloadOriginals: () => void | Promise<void>;
  panelRef: React.Ref<HTMLDivElement>;
  overwrite: boolean;
  onOverwriteChange: (value: boolean) => void;
}

const tierKey = (tier: ExportTier) => `${tier.still}/${tier.animated}`;

/** "256 / 128 px" only when both media types are actually on the sheet. */
function tierLabel(tier: TierEstimate): string {
  if (!tier.animatedCount) return `${tier.still} px`;
  if (!tier.stillCount) return `${tier.animated} px`;
  return `${tier.still} / ${tier.animated} px`;
}

export function ExportOptions({id, estimates, pinnedTier, onPinTier, onRun, formats, onDownloadOriginals, panelRef, overwrite, onOverwriteChange}: ExportOptionsProps) {
  const {tiers, best, active, originalsBytes} = estimates;
  const primary = formats.find(format => format.primary);
  const others = formats.filter(format => !format.primary);
  const limit = formatBytes(SLACK_SCRIPT_LIMIT);
  const mixed = !!(tiers[0]?.stillCount && tiers[0]?.animatedCount);

  return (
    <div ref={panelRef} id={id} popover="auto" role="group" className="export-menu" aria-label="Export options">
      {tiers.length > 0 && (
        <div className="size-options" role="group" aria-labelledby={`${id}-size`}>
          <div className="size-options-head">
            <h3 id={`${id}-size`}>Image size</h3>
            <span>
              {tiers[0].stillCount > 0 && `${tiers[0].stillCount} still${tiers[0].stillCount === 1 ? "" : "s"}`}
              {mixed && " · "}
              {tiers[0].animatedCount > 0 && `${tiers[0].animatedCount} animated`}
            </span>
          </div>
          <p className="size-options-limit">
            <span>Slack accepts a paste up to <strong>{limit}</strong></span>
            <span className="size-options-limit-end" aria-hidden="true">{limit}</span>
          </p>

          <button
            type="button"
            aria-pressed={pinnedTier === null}
            className="size-option"
            data-active={pinnedTier === null}
            onClick={() => onPinTier(null)}
          >
            <span className="size-option-mark" aria-hidden="true">{pinnedTier === null && <Check className="h-3 w-3" />}</span>
            <span className="size-option-name">
              Best fit
              <small>largest that stays under {formatBytes(SLACK_SCRIPT_LIMIT)}</small>
            </span>
            <span className="size-option-figures">
              <span className="size-option-px">{best ? tierLabel(best) : "—"}</span>
              <span className="size-option-bytes">{best ? `≈ ${formatBytes(best.bytes)}` : ""}</span>
            </span>
          </button>

          {tiers.map((tier) => {
            const pinnedHere = !!pinnedTier && tierKey(pinnedTier) === tierKey(tier);
            return (
              <button
                key={tierKey(tier)}
                type="button"
                aria-pressed={pinnedHere}
                className="size-option"
                data-active={pinnedHere}
                data-over={!tier.fits}
                onClick={() => onPinTier({still: tier.still, animated: tier.animated})}
              >
                <span className="size-option-mark" aria-hidden="true">{pinnedHere && <Check className="h-3 w-3" />}</span>
                <span className="size-option-name">
                  {tierLabel(tier)}
                  <small>
                    {tier.fits
                      ? tier === best && pinnedTier === null ? "what best fit picks" : "fits the limit"
                      : "over the limit — may not paste"}
                  </small>
                </span>
                <span className="size-option-figures">
                  <span className="size-option-bytes">≈ {formatBytes(tier.bytes)}{!tier.fits && " · over"}</span>
                  <span className="size-option-bar" aria-hidden="true">
                    <i style={{width: `${Math.min(100, (tier.bytes / SLACK_SCRIPT_LIMIT) * 100)}%`}} />
                  </span>
                </span>
              </button>
            );
          })}

          {/* Full resolution lives outside the ladder: Slack caps custom emoji
              at 128 KB each and renders them small, so the originals are a
              download rather than a paste. */}
          <button
            type="button"
            className="size-option size-option-originals"
            onClick={() => onRun(onDownloadOriginals)}
          >
            <span className="size-option-mark" aria-hidden="true"><Download className="h-3 w-3" /></span>
            <span className="size-option-name">
              Originals
              <small>full-size ZIP download, not a Slack paste</small>
            </span>
            <span className="size-option-figures">
              <span className="size-option-px">Full size</span>
              <span className="size-option-bytes">{originalsBytes ? formatBytes(originalsBytes) : ""}</span>
            </span>
          </button>
        </div>
      )}

      <div className="export-replace" role="group" aria-labelledby={`${id}-replace-title`} data-on={overwrite}>
        <label className="export-replace-switch">
          <input type="checkbox" checked={overwrite} onChange={event => onOverwriteChange(event.target.checked)} aria-describedby={`${id}-overwrite-warning`} />
          <span id={`${id}-replace-title`}>Overwrite existing Slack emojis</span>
        </label>
        <div className="export-overwrite" id={`${id}-overwrite-warning`}>
          <p className="export-overwrite-lead"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Deletes same-name emojis before uploading ours, even if yours is larger or animated.</p>
          <p>Requires deletion permission: typically an admin/owner or the emoji’s creator, subject to workspace policy. The script requires an originals backup and confirmation in Slack. Recovery is best effort.</p>
        </div>
      </div>

      {primary && (
        <div className="export-primary" data-destructive={overwrite} data-over={!!active && !active.fits}>
          <button type="button" className="export-primary-button" onClick={() => onRun(primary.run)}>
            {primary.label}
          </button>
          {active ? (
            <p>
              <span>{tierLabel(active)}</span>
              <span>≈ {formatBytes(active.bytes)}</span>
              <span>{active.fits ? `of ${limit}` : `is over ${limit}, so it may not paste`}</span>
            </p>
          ) : <p>Copies a script to paste into Slack</p>}
        </div>
      )}

      <div className="export-formats" role="group" aria-labelledby={`${id}-formats`}>
        <h3 id={`${id}-formats`}>Other formats</h3>
        <div className="export-formats-list">
          {others.map((format) => (
            <button key={format.label} type="button" onClick={() => onRun(format.run)}>
              {format.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
