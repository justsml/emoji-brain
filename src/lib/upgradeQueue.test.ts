import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickNearest, resetUpgradesForTests, startUpgrades, UPGRADE_CONCURRENCY, useUpgradedSrc } from './upgradeQueue';

afterEach(() => { resetUpgradesForTests(); document.body.replaceChildren(); vi.useRealTimers(); });

describe('pickNearest', () => {
  it('takes the candidate closest to the last interaction', () => {
    const far = {key: 'far', src: 'f', x: 900, y: 900}, near = {key: 'near', src: 'n', x: 120, y: 80};
    expect(pickNearest([far, near], {x: 100, y: 100})).toBe(near);
    expect(pickNearest([], {x: 0, y: 0})).toBeUndefined();
  });
});

/** A grid of images laid out in a row, 100px apart, all on screen. */
function grid(count: number, {ready = true} = {}) {
  const root = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const image = document.createElement('img');
    image.dataset.upgradeKey = `e${i}`;
    image.dataset.upgradeSrc = `/256/e${i}.webp`;
    if (ready) image.dataset.ready = '';
    image.getBoundingClientRect = () => ({left: i * 100, right: i * 100 + 64, top: 10, bottom: 74, width: 64, height: 64}) as DOMRect;
    root.append(image);
  }
  document.body.append(root);
  return root;
}
const frame = () => act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(null))); });

describe('startUpgrades', () => {
  it('runs at most two downloads at once, nearest the pointer first, and publishes each', async () => {
    const root = grid(4);
    const pending: Record<string, () => void> = {};
    const preload = vi.fn((src: string) => new Promise<void>(resolve => { pending[src] = resolve; }));
    const {result} = renderHook(() => useUpgradedSrc('e3'));
    const stop = startUpgrades(root, preload);
    document.dispatchEvent(new PointerEvent('pointermove', {clientX: 330, clientY: 40}));
    await frame();
    expect(preload).toHaveBeenCalledTimes(UPGRADE_CONCURRENCY);
    expect(preload.mock.calls.map(([src]) => src)).toEqual(['/256/e3.webp', '/256/e2.webp']);
    await act(async () => { pending['/256/e3.webp'](); });
    expect(result.current).toBe('/256/e3.webp');
    await frame();
    expect(preload).toHaveBeenCalledTimes(3);
    stop();
  });

  it('waits while anything on screen is still loading its smallest file', async () => {
    const root = grid(3, {ready: false});
    const preload = vi.fn(() => Promise.resolve());
    const stop = startUpgrades(root, preload);
    await frame();
    expect(preload).not.toHaveBeenCalled();
    for (const image of root.querySelectorAll('img')) image.dataset.ready = '';
    root.dispatchEvent(new Event('load'));
    await frame();
    expect(preload).toHaveBeenCalled();
    stop();
  });
});
