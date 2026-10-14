import {useSyncExternalStore} from 'react';

/**
 * Light previews start every sticker at the smallest file. Once everything on
 * screen has painted, this sharpens them in the background: two downloads at a
 * time, nearest to the last thing the person pointed at, tapped or focused
 * first, and only near the viewport. A new low-res sticker scrolling into view
 * always goes first; upgrades only spend bandwidth nothing else is waiting on.
 *
 * Images opt in declaratively: the grid renders `data-upgrade-key` and
 * `data-upgrade-src` on any image that has a better file to offer. The queue
 * preloads and decodes that file off-screen, then publishes it here, and the
 * cell re-renders with it: the swap is instant because the bytes are cached.
 */
export const UPGRADE_CONCURRENCY = 2;

const upgraded = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The sharper URL for `key`, once it has been fetched and decoded. */
export function useUpgradedSrc(key: string): string | undefined {
  return useSyncExternalStore(subscribe, () => upgraded.get(key), () => undefined);
}

function publish(key: string, src: string) {
  upgraded.set(key, src);
  for (const listener of listeners) listener();
}

export interface Candidate { key: string; src: string; x: number; y: number }

/** Nearest first; ties keep document order. */
export function pickNearest<T extends Candidate>(candidates: T[], point: {x: number; y: number}): T | undefined {
  let best: T | undefined, bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance) { best = candidate; bestDistance = distance; }
  }
  return best;
}

const isSettled = (image: HTMLImageElement) =>
  image.hasAttribute('data-ready') || image.dataset.previewUnavailable !== undefined;

/** Start sharpening `grid`'s stickers. Returns a stop function. */
export function startUpgrades(grid: HTMLElement, preload = preloadImage): () => void {
  let stopped = false;
  const inFlight = new Set<string>();
  const failed = new Set<string>();
  const centre = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  };
  // Pointer events from before hydration are gone, but `:hover` and focus
  // still say where someone is. Failing both, favour the top of the screen.
  const resting = grid.querySelector('[role="gridcell"]:hover') ?? (grid.contains(document.activeElement) ? document.activeElement : null);
  let point = resting ? centre(resting) : {x: window.innerWidth / 2, y: 0};

  const pump = () => {
    if (stopped || document.hidden) return;
    const viewport = window.innerHeight;
    const candidates: Candidate[] = [];
    for (const image of grid.querySelectorAll<HTMLImageElement>('img[data-upgrade-src]')) {
      const rect = image.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < viewport;
      // Something visible is still waiting on its first, smallest file.
      if (onScreen && !isSettled(image)) return;
      const key = image.dataset.upgradeKey!, src = image.dataset.upgradeSrc!;
      if (!isSettled(image) || inFlight.has(key) || failed.has(key) || upgraded.get(key) === src) continue;
      // Half a screen of lookahead either way, for the next scroll.
      if (rect.bottom < -viewport / 2 || rect.top > viewport * 1.5) continue;
      candidates.push({key, src, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2});
    }
    while (inFlight.size < UPGRADE_CONCURRENCY) {
      const next = pickNearest(candidates, point);
      if (!next) return;
      candidates.splice(candidates.indexOf(next), 1);
      inFlight.add(next.key);
      preload(next.src).then(
        () => { if (!stopped) publish(next.key, next.src); },
        () => { failed.add(next.key); },
      ).finally(() => { inFlight.delete(next.key); schedule(); });
    }
  };

  // Coalesce bursts of loads, scrolls and pointer moves into one pass.
  let queued = false;
  const schedule = () => {
    if (queued || stopped) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; pump(); });
  };
  const onPointer = (event: PointerEvent) => { point = {x: event.clientX, y: event.clientY}; schedule(); };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Element) point = centre(event.target);
    schedule();
  };
  // Scrolling moves the content, not the pointer: keep the same screen point.
  const options = {passive: true, capture: true} as const;
  grid.addEventListener('load', schedule, true);
  // Anywhere on the page: a pointer resting beside the grid still says which
  // part of it someone is looking at.
  document.addEventListener('pointerdown', onPointer, options);
  document.addEventListener('pointermove', onPointer, options);
  grid.addEventListener('focusin', onFocus);
  window.addEventListener('scroll', schedule, {passive: true});
  document.addEventListener('visibilitychange', schedule);
  // Catches images React swapped in without a load event reaching us yet.
  const timer = setInterval(schedule, 1000);
  schedule();
  return () => {
    stopped = true;
    clearInterval(timer);
    grid.removeEventListener('load', schedule, true);
    document.removeEventListener('pointerdown', onPointer, options);
    document.removeEventListener('pointermove', onPointer, options);
    grid.removeEventListener('focusin', onFocus);
    window.removeEventListener('scroll', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}

/** Fetch and decode off-screen, so the visible swap never blanks. */
function preloadImage(src: string): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode();
}

/** Test seam. */
export function resetUpgradesForTests() { upgraded.clear(); listeners.clear(); }
