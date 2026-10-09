import { afterEach, expect, it, vi } from 'vitest';
import { scrollEmojiName } from './emojiNameScroll';

afterEach(() => vi.unstubAllGlobals());

function setup(overflow = 80, reduced = false) {
  const label = document.createElement('span');
  label.innerHTML = '<span>:a-long-emoji-name:</span>';
  Object.defineProperties(label, { clientWidth: { value: 100 }, scrollWidth: { value: 100 + overflow } });
  const animation = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn() };
  const animate = vi.fn(() => animation);
  (label.firstElementChild as any).animate = animate;
  let intersect: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const motion = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => motion);
  const stop = scrollEmojiName(label);
  return { label, animation, animate, disconnect, motion, stop, visible: (value: boolean) => intersect([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver) };
}

it('moves only the clipped distance, pauses off screen, and releases the animation', () => {
  const { label, animation, animate, visible, disconnect, stop } = setup();
  const [frames, options] = animate.mock.calls[0] as any;
  expect(frames[1].transform).toBe('translateX(-80px)');
  expect(options.duration).toBeGreaterThan(9000);
  expect(animation.pause).toHaveBeenCalled();
  visible(true);
  expect(animation.play).toHaveBeenCalledOnce();
  visible(false);
  expect(animation.pause).toHaveBeenCalledTimes(2);
  stop();
  expect(animation.cancel).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(label).not.toHaveClass('is-scrolling');
});

it.each([[0, false], [80, true]])('keeps fitting names and reduced-motion names still', (overflow, reduced) => {
  const { animate, label, stop } = setup(overflow, reduced);
  expect(animate).not.toHaveBeenCalled();
  expect(label).not.toHaveClass('is-scrolling');
  stop();
});
