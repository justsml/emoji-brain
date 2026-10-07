import { memo, useEffect, useState } from "react";

const DETAILS = ["/desk/grain.svg", "/desk/scuffs.svg", "/desk/carvings.svg"];

/**
 * The tray as a plastic school desk. The groove is plain CSS and paints with
 * the bar; grain, scuffs, carvings and the pencil wait until the browser is idle and the
 * masks have decoded, then fade in together, so the grid never competes with
 * decoration for the network or the main thread.
 */
export const DeskSurface = memo(function DeskSurface({ count }: { count: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all(DETAILS.map(src => {
      const image = new Image();
      image.src = src;
      return image.decode();
    })).then(() => { if (!cancelled) setReady(true); }, () => {});
    const idle = window.requestIdleCallback?.(load, { timeout: 4000 }) ?? window.setTimeout(load, 1500);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);
  return (
    <div className="desk-surface" aria-hidden="true" data-ready={ready || undefined}>
      <span className="desk-grain" />
      <span className="desk-scuffs" />
      {/* One mask, twice: a lit lip under a dark cut reads as carved in. */}
      <span className="desk-carve desk-carve-lip" />
      <span className="desk-carve" />
      {/* Remounting on each change replays the nudge: the pencil answers the sheet. */}
      <i className="desk-pencil" key={count} />
    </div>
  );
});
