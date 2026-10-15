import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { connectionSignal, looksStalled, PREVIEW_QUALITY_KEY, reportStall, resetPreviewQualityForTests, setPreviewPreference, usePreviewQuality } from './previewQuality';

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
