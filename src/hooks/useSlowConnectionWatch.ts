import { useEffect, type RefObject } from "react";
import { blankGapTracker, looksStalled, pageLoadSignal, reportSlow, usePreviewQuality, STALL_AFTER_MS } from "../lib/previewQuality";

declare global {
  interface Window {
    /** Set by the layout's pre-hydration script each time a grid sticker loads. */
    emojiReadyAt?: number;
    /** The tab has been in the background at some point this visit. */
    emojiHiddenSeen?: boolean;
  }
}

const TICK_MS = 1000;

/**
 * Watches for the connection failing the grid, for browsers that won't say
 * (Safari and Firefox have no Network Information API), and switches to light
 * previews when it does:
 * - the page arrived slowly: HTML still downloading at 6s, or hydration at 8s;
 * - most of the first screen is still loading 6s in;
 * - stickers on screen are waiting and none has appeared for 3s, at any point
 *   in the visit, e.g. after scrolling into a part of the sheet that stalls.
 * Stops once light previews are on, and skips hidden tabs, whose timers and
 * fetches the browser throttles anyway.
 */
export function useSlowConnectionWatch(gridRef: RefObject<HTMLElement | null>) {
  const { slow } = usePreviewQuality();
  const watching = !slow || slow === "recent";

  useEffect(() => {
    if (!watching) return;
    // Load timings from a tab that was ever in the background are throttled,
    // not slow; the blank-screen check still runs, measured from now.
    const throttled = !!window.emojiHiddenSeen;
    if (!throttled) {
      const navigation = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
      const pageSignal = pageLoadSignal(navigation?.responseEnd, performance.now());
      if (pageSignal) { reportSlow(pageSignal); return; }
    }

    const blank = blankGapTracker(undefined, throttled ? performance.now() : 0);
    let checkedFirstScreen = false;
    const tick = () => {
      if (document.hidden) return;
      const viewportHeight = window.innerHeight;
      const boxes = Array.from(gridRef.current?.querySelectorAll<HTMLImageElement>(".emoji-card-image") ?? [], image => {
        const { top, bottom } = image.getBoundingClientRect();
        // A preview that failed outright isn't waiting on anything.
        const settled = image.hasAttribute("data-ready") || image.dataset.previewUnavailable !== undefined || (image.complete && image.naturalWidth > 0);
        return { top, bottom, ready: settled };
      });
      const now = performance.now();
      const visiblePending = boxes.some(box => !box.ready && box.bottom > 0 && box.top < viewportHeight);
      if (blank(now, visiblePending, window.emojiReadyAt ?? 0)) return reportSlow("stalled");
      if (!checkedFirstScreen && !throttled && now >= STALL_AFTER_MS) {
        checkedFirstScreen = true;
        if (looksStalled(boxes, viewportHeight)) reportSlow("stalled");
      }
    };
    const timer = setInterval(tick, TICK_MS);
    // Time spent in a background tab says nothing about the connection.
    const onVisible = () => { if (!document.hidden) window.emojiReadyAt = performance.now(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [watching, gridRef]);
}
