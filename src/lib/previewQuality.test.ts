import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { blankGapTracker, connectionSignal, looksStalled, pageLoadSignal, PREVIEW_QUALITY_KEY, REMEMBER_SLOW_MS, reportSlow, reportStall, resetPreviewQualityForTests, setPreviewPreference, SLOW_SEEN_KEY, usePreviewQuality } from './previewQuality';

afterEach(() => { resetPreviewQualityForTests(); localStorage.clear(); });

describe('connection signal', () => {
  it('trusts data saver and 2G reports, and nothing else', () => {
    const info = (fields: object) => Object.assign(new EventTarget(), fields);
    expect(connectionSignal(info({saveData: true, effectiveType: '4g'}))).toBe('save-data');
    expect(connectionSignal(info({effectiveType: 'slow-2g'}))).toBe('network');
    expect(connectionSignal(info({effectiveType: '2g'}))).toBe('network');
    expect(connectionSignal(info({effectiveType: '3g'}))).toBeNull();
    expect(connectionSignal(undefined)).toBeNull();
  });
});

describe('stall detection', () => {
  const box = (top: number, ready: boolean) => ({top, bottom: top + 100, ready});
  it('needs most of the visible stickers to still be waiting', () => {
    expect(looksStalled([box(0, false), box(0, false), box(0, false), box(0, true)], 800)).toBe(true);
    expect(looksStalled([box(0, false), box(0, false), box(0, true), box(0, true)], 800)).toBe(false);
  });
  it('ignores stickers below the fold and tiny result sets', () => {
    const offscreen = Array.from({length: 20}, () => box(2000, false));
    expect(looksStalled([...offscreen, box(0, true), box(0, true), box(0, true), box(0, true)], 800)).toBe(false);
    expect(looksStalled([box(0, false), box(0, false)], 800)).toBe(false);
  });
});

describe('preview quality', () => {
  it('starts sharp, goes light on a stall, and honours an explicit choice', () => {
    const {result} = renderHook(() => usePreviewQuality());
    expect(result.current).toEqual({preference: 'auto', slow: null, light: false});
    act(() => reportStall());
    expect(result.current).toMatchObject({slow: 'stalled', light: true});
    act(() => setPreviewPreference('sharp'));
    expect(result.current.light).toBe(false);
    expect(localStorage.getItem(PREVIEW_QUALITY_KEY)).toBe('sharp');
    act(() => setPreviewPreference('auto'));
    expect(result.current.light).toBe(true);
    expect(localStorage.getItem(PREVIEW_QUALITY_KEY)).toBeNull();
  });
  it('restores a stored light preference', () => {
    localStorage.setItem(PREVIEW_QUALITY_KEY, 'light');
    const {result} = renderHook(() => usePreviewQuality());
    expect(result.current).toMatchObject({preference: 'light', light: true});
  });
});

describe('slow page loads', () => {
  it('flags HTML still arriving after 6s or hydration after 8s', () => {
    expect(pageLoadSignal(6500, 7000)).toBe('slow-load');
    expect(pageLoadSignal(1200, 8500)).toBe('slow-load');
    expect(pageLoadSignal(1200, 3000)).toBeNull();
    expect(pageLoadSignal(undefined, 3000)).toBeNull();
  });
});

describe('blank gaps', () => {
  it('trips after 3s of waiting stickers with none arriving', () => {
    const blank = blankGapTracker(3000);
    expect(blank(1000, true, 0)).toBe(false);
    expect(blank(2500, true, 0)).toBe(false);
    expect(blank(3000, true, 0)).toBe(true);
  });
  it('restarts the clock whenever a sticker arrives', () => {
    const blank = blankGapTracker(3000);
    expect(blank(4000, true, 2000)).toBe(false);
    expect(blank(5500, true, 2000)).toBe(true);
  });
  it('only counts time spent looking at waiting stickers', () => {
    const blank = blankGapTracker(3000);
    expect(blank(10_000, false, 0)).toBe(false); // everything on screen had loaded
    expect(blank(12_000, true, 0)).toBe(false);  // scrolled into a gap 2s ago
    expect(blank(13_000, true, 0)).toBe(true);
  });
  it('can start measuring later, e.g. after a background tab comes forward', () => {
    const blank = blankGapTracker(3000, 9000);
    expect(blank(10_000, true, 0)).toBe(false);
    expect(blank(12_000, true, 0)).toBe(true);
  });
});

describe('remembering a slow visit', () => {
  it('records evidence and starts the next visit light, for an hour', () => {
    act(() => reportSlow('slow-load'));
    expect(Number(localStorage.getItem(SLOW_SEEN_KEY))).toBeGreaterThan(Date.now() - 1000);
    resetPreviewQualityForTests();
    const {result} = renderHook(() => usePreviewQuality());
    expect(result.current).toMatchObject({slow: 'recent', light: true});
    act(() => reportStall());
    expect(result.current.slow).toBe('stalled');
  });
  it('forgets after an hour', () => {
    localStorage.setItem(SLOW_SEEN_KEY, String(Date.now() - REMEMBER_SLOW_MS - 1));
    const {result} = renderHook(() => usePreviewQuality());
    expect(result.current).toMatchObject({slow: null, light: false});
  });
});
