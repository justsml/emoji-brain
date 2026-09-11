import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import type {ExportEstimates} from "../hooks/useExportEstimates";
import {formatBytes, SLACK_SCRIPT_LIMIT} from "../lib/slackSizeEstimate";

/**
 * The page's promise about sizing, kept honest as you pick. The slot is
 * server-rendered with a plain sentence so the note reads correctly before
 * (and without) hydration; we take it over once the island is live.
 */
export function ExportEstimateNote({estimates, count}: {estimates: ExportEstimates; count: number}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = document.getElementById("export-estimate");
    if (!element) return;
    element.querySelector("[data-estimate-fallback]")?.remove();
    setSlot(element);
  }, []);

  if (!slot) return null;
  const active = estimates.active;

  if (count === 0 || !active) {
    return createPortal(<span className="estimate-idle">pick fewer, get bigger.</span>, slot);
  }

  const fraction = Math.min(1, active.bytes / SLACK_SCRIPT_LIMIT);
  const sizes = (
    <>
      <b>{active.stillCount ? `${active.still} px` : `${active.animated} px`}</b>
      {active.stillCount > 0 && active.animatedCount > 0 && <> stills, <b>{active.animated} px</b> animated</>}
    </>
  );

  return createPortal(
    <span className="estimate-live" data-over={!active.fits}>
      <span className="estimate-line">
        {active.fits ? (
          <>
            your <b>{count.toLocaleString()}</b> fit at {sizes} —{" "}
            <b className="estimate-bytes">≈ {formatBytes(active.bytes)}</b> of {formatBytes(SLACK_SCRIPT_LIMIT)}.
          </>
        ) : (
          <>
            your <b>{count.toLocaleString()}</b> reach{" "}
            <b className="estimate-bytes">≈ {formatBytes(active.bytes)}</b> even at {sizes} — over the{" "}
            {formatBytes(SLACK_SCRIPT_LIMIT)} paste limit, so export in batches.
          </>
        )}
      </span>
      <span className="estimate-meter" aria-hidden="true">
        <i style={{width: `${Math.max(2, fraction * 100)}%`}} />
      </span>
    </span>,
    slot,
  );
}
