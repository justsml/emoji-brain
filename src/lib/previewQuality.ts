import {useSyncExternalStore} from 'react';

/**
 * Light previews: on a constrained connection the grid asks for the 64px
 * stills (128px on dense screens) instead of 256px, and animations wait for a
 * tap instead of starting on hover. "auto" decides from the Network
 * Information API where a browser has one, and from the grid itself — visible
 * stickers still loading after several seconds — where it doesn't.
 */
export type PreviewPreference = 'auto' | 'light' | 'sharp';
export type SlowSignal = 'save-data' | 'network' | 'stalled' | null;
export interface PreviewQuality {
  preference: PreviewPreference;
  slow: SlowSignal;
  light: boolean;
}

export const PREVIEW_QUALITY_KEY = 'emoji-preview-quality';
/** Long enough that an ordinary connection has painted the first screen. */
export const STALL_AFTER_MS = 6000;

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
  update({preference: readPreference(), slow: connectionSignal()});
  // A stall is evidence about this visit; a reported connection type can recover.
  connection()?.addEventListener('change', () => {
    const signal = connectionSignal();
    if (snapshot.slow !== 'stalled') update({slow: signal});
    else if (signal) update({slow: signal});
  });
}

export function reportStall() {
  start();
  if (!snapshot.slow) update({slow: 'stalled'});
}

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

/** Test seam: forget module state between cases. */
export function resetPreviewQualityForTests() {
  snapshot = SERVER;
  started = false;
  listeners.clear();
}
