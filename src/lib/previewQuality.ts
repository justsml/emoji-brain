import {useSyncExternalStore} from 'react';

/**
 * Light previews: on a constrained connection the grid asks for the 64px
 * stills (128px on dense screens) instead of 256px, and animations wait for a
 * tap instead of starting on hover. "auto" decides from the Network
 * Information API where a browser has one, and from what the visit itself
 * shows where it doesn't: a page that took seconds to arrive, or seconds of
 * blank stickers on screen. Evidence like that is remembered for an hour, so
 * the next page load starts light before any of it has to be relearned.
 */
export type PreviewPreference = 'auto' | 'light' | 'sharp';
export type SlowSignal = 'save-data' | 'network' | 'slow-load' | 'stalled' | 'recent' | null;
export interface PreviewQuality {
  preference: PreviewPreference;
  slow: SlowSignal;
  light: boolean;
}

export const PREVIEW_QUALITY_KEY = 'emoji-preview-quality';
/** When this visit last proved slow, as epoch ms. */
export const SLOW_SEEN_KEY = 'emoji-slow-seen-at';
/** Long enough that an ordinary connection has painted the first screen. */
export const STALL_AFTER_MS = 6000;
/** The HTML itself took this long to arrive. */
export const SLOW_PAGE_MS = 6000;
/** The grid became interactive this long after navigation started. */
export const SLOW_HYDRATION_MS = 8000;
/** Stickers on screen, waiting, and not one has appeared for this long. */
export const BLANK_GAP_MS = 3000;
/** How long a slow visit colours the next one. */
export const REMEMBER_SLOW_MS = 60 * 60 * 1000;

const SERVER: PreviewQuality = {preference: 'auto', slow: null, light: false};
let snapshot = SERVER;
let started = false;
const listeners = new Set<() => void>();

interface NetworkInformation extends EventTarget { saveData?: boolean; effectiveType?: string }
const connection = () => (globalThis.navigator as Navigator & {connection?: NetworkInformation} | undefined)?.connection;

export function connectionSignal(info = connection()): SlowSignal {
  if (!info) return null;
  if (info.saveData) return 'save-data';
  return info.effectiveType === 'slow-2g' || info.effectiveType === '2g' ? 'network' : null;
}

function readPreference(): PreviewPreference {
  try {
    const stored = localStorage.getItem(PREVIEW_QUALITY_KEY);
    return stored === 'light' || stored === 'sharp' ? stored : 'auto';
  } catch { return 'auto'; }
}

function rememberedSignal(now = Date.now()): SlowSignal {
  try {
    const seen = Number(localStorage.getItem(SLOW_SEEN_KEY));
    return seen && now - seen < REMEMBER_SLOW_MS ? 'recent' : null;
  } catch { return null; }
}

function update(patch: Partial<PreviewQuality>) {
  const next = {...snapshot, ...patch};
  next.light = next.preference === 'light' || (next.preference === 'auto' && next.slow !== null);
  if (next.preference === snapshot.preference && next.slow === snapshot.slow) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function start() {
  if (started) return;
  started = true;
  update({preference: readPreference(), slow: connectionSignal() ?? rememberedSignal()});
  // What this visit (or a recent one) observed sticks; a reported connection
  // type can recover.
  connection()?.addEventListener('change', () => {
    const signal = connectionSignal();
    const observed = snapshot.slow === 'stalled' || snapshot.slow === 'slow-load' || snapshot.slow === 'recent';
    if (signal || !observed) update({slow: signal});
  });
}

/** Evidence from this visit that the connection can't keep up. */
export function reportSlow(signal: 'slow-load' | 'stalled') {
  start();
  try { localStorage.setItem(SLOW_SEEN_KEY, String(Date.now())); } catch { /* still applies to this visit */ }
  if (!snapshot.slow || snapshot.slow === 'recent') update({slow: signal});
}
export const reportStall = () => reportSlow('stalled');

export function setPreviewPreference(preference: PreviewPreference) {
  start();
  try {
    if (preference === 'auto') localStorage.removeItem(PREVIEW_QUALITY_KEY);
    else localStorage.setItem(PREVIEW_QUALITY_KEY, preference);
  } catch { /* the choice still holds for this visit */ }
  update({preference});
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The server can't know the connection, so hydration always starts from "auto, fast". */
export function usePreviewQuality(): PreviewQuality {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}

/**
 * True when most of the stickers on screen are still waiting on the network.
 * Takes boxes rather than elements so it is cheap to test and to call.
 */
export function looksStalled(images: {top: number; bottom: number; ready: boolean}[], viewportHeight: number): boolean {
  const visible = images.filter(image => image.bottom > 0 && image.top < viewportHeight);
  if (visible.length < 4) return false;
  return visible.filter(image => !image.ready).length / visible.length > 0.5;
}

/**
 * Did the page itself arrive slowly? `htmlDoneMs` is the navigation entry's
 * responseEnd; `hydratedAtMs` is when the grid mounted. Both count from
 * navigation start. A slow hydration can also mean a slow phone, which light
 * previews help too: fewer pixels to decode.
 */
export function pageLoadSignal(htmlDoneMs: number | undefined, hydratedAtMs: number): 'slow-load' | null {
  return (htmlDoneMs ?? 0) > SLOW_PAGE_MS || hydratedAtMs > SLOW_HYDRATION_MS ? 'slow-load' : null;
}

/**
 * Tracks how long the screen has shown waiting stickers with no new one
 * arriving. Call on each tick with whether any visible sticker is pending and
 * when the last one finished (navigation-relative ms). The first gap is
 * measured from navigation start: someone staring at an empty grid before the
 * app hydrated was waiting that whole time.
 */
export function blankGapTracker(gapMs = BLANK_GAP_MS, startMs = 0) {
  let since = startMs;
  return (now: number, visiblePending: boolean, lastReadyMs: number): boolean => {
    if (!visiblePending) { since = now; return false; }
    return now - Math.max(since, lastReadyMs) >= gapMs;
  };
}

/** Test seam: forget module state between cases. */
export function resetPreviewQualityForTests() {
  snapshot = SERVER;
  started = false;
  listeners.clear();
}
