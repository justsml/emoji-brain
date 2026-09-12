import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useLocalStorage} from './useLocalStorage';

let idle: Map<number, IdleRequestCallback>;
let next: number;
beforeEach(() => {
  localStorage.clear();
  idle = new Map(); next = 0;
  vi.stubGlobal('requestIdleCallback', vi.fn((callback: IdleRequestCallback) => {idle.set(++next, callback); return next;}));
  vi.stubGlobal('cancelIdleCallback', vi.fn((id: number) => idle.delete(id)));
});
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});
function runIdle() {
  const callbacks = [...idle.values()]; idle.clear();
  act(() => callbacks.forEach(callback => callback({didTimeout: false, timeRemaining: () => 10})));
}

it('updates UI immediately and coalesces writes until idle', () => {
  const write = vi.spyOn(window.localStorage, 'setItem');
  const {result} = renderHook(() => useLocalStorage('selection', [] as string[]));
  act(() => result.current[1](['one']));
  act(() => result.current[1](prev => [...prev, 'two']));
  expect(result.current[0]).toEqual(['one', 'two']);
  expect(write).not.toHaveBeenCalled();
  runIdle();
  expect(write).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem('selection')!)).toEqual(['one', 'two']);
});

it('flushes the latest selection on pagehide before an immediate reload', () => {
  const {result} = renderHook(() => useLocalStorage('selection', ['old']));
  act(() => result.current[1](['new']));
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(JSON.parse(localStorage.getItem('selection')!)).toEqual(['new']);
  expect(idle.size).toBe(0);
});

it('flushes on unmount and does not let an old callback overwrite new data', () => {
  const {result, unmount} = renderHook(() => useLocalStorage('selection', [] as string[]));
  act(() => result.current[1](['new']));
  unmount();
  expect(JSON.parse(localStorage.getItem('selection')!)).toEqual(['new']);
  expect(idle.size).toBe(0);
});

it('uses a deferred timer when idle callbacks are unavailable', () => {
  vi.stubGlobal('requestIdleCallback', undefined);
  vi.useFakeTimers();
  try {
    const {result, unmount} = renderHook(() => useLocalStorage('selection', [] as string[]));
    act(() => result.current[1](['new']));
    expect(localStorage.getItem('selection')).toBeNull();
    act(() => vi.runAllTimers());
    expect(JSON.parse(localStorage.getItem('selection')!)).toEqual(['new']);
    unmount();
  } finally {vi.useRealTimers();}
});
