import {Check, Download} from "lucide-react";
import type {ExportEstimates} from "../hooks/useExportEstimates";
import {formatBytes, SLACK_SCRIPT_LIMIT, type ExportTier, type TierEstimate} from "../lib/slackSizeEstimate";

interface ExportOptionsProps {
  id: string;
  estimates: ExportEstimates;
  /** null means "let the planner choose". */
  pinnedTier: ExportTier | null;
  onPinTier: (tier: ExportTier | null) => void;
  onRun: (action: () => void | Promise<void>) => void;
  formats: {label: string; run: () => void | Promise<void>}[];
  /** Downloads the full-resolution sources; they are far too big to paste. */
  onDownloadOriginals: () => void | Promise<void>;
  panelRef: React.Ref<HTMLDivElement>;
}

const tierKey = (tier: ExportTier) => `${tier.still}/${tier.animated}`;

/** "256 / 128 px" only when both media types are actually on the sheet. */
function tierLabel(tier: TierEstimate): string {
  if (!tier.animatedCount) return `${tier.still} px`;
  if (!tier.stillCount) return `${tier.animated} px`;
  return `${tier.still} / ${tier.animated} px`;
}

export function ExportOptions({id, estimates, pinnedTier, onPinTier, onRun, formats, onDownloadOriginals, panelRef}: ExportOptionsProps) {
  const {tiers, best, active, originalsBytes} = estimates;
  const mixed = !!(tiers[0]?.stillCount && tiers[0]?.animatedCount);

  return (
    <div ref={panelRef} id={id} popover="auto" role="menu" className="export-menu" aria-label="Export options">
      {tiers.length > 0 && (
        <div className="size-options">
          <div className="size-options-head">
            <h3>Image size</h3>
            <span>
              {tiers[0].stillCount > 0 && `${tiers[0].stillCount} still${tiers[0].stillCount === 1 ? "" : "s"}`}
              {mixed && " · "}
              {tiers[0].animatedCount > 0 && `${tiers[0].animatedCount} animated`}
            </span>
          </div>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={pinnedTier === null}
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
                role="menuitemradio"
                aria-checked={pinnedHere}
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
                  <span className="size-option-bytes">≈ {formatBytes(tier.bytes)}</span>
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
            role="menuitem"
            className="size-option size-option-originals"
            onClick={() => onRun(onDownloadOriginals)}
          >
            <span className="size-option-mark" aria-hidden="true"><Download className="h-3 w-3" /></span>
            <span className="size-option-name">
              Originals
              <small>full resolution — ZIP download, not a Slack paste</small>
            </span>
            <span className="size-option-figures">
              <span className="size-option-px">{tiers[0]?.stillCount ? "1024 px" : "512 px"}</span>
              <span className="size-option-bytes">{originalsBytes ? formatBytes(originalsBytes) : ""}</span>
            </span>
          </button>
        </div>
      )}

      <div className="export-formats">
        <h3>Copy as</h3>
        {formats.map((format) => (
          <button key={format.label} type="button" role="menuitem" onClick={() => onRun(format.run)}>
            {format.label}
          </button>
        ))}
      </div>
    </div>
  );
}
