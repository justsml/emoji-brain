import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EmojiGrid from './EmojiGrid';

const { start, stop } = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('../lib/emojiNameScroll', () => ({ scrollEmojiName: start }));
const emoji = { id: 'long', filename: 'a-long-emoji-name.webp', path: '', categories: [], tags: [], size: 1 };
const props = { emojis: [emoji], focusedIndex: 0, gridScale: 0, onToggleSelection: vi.fn(), onSetFocusedIndex: vi.fn(), onAnnounceSelection: vi.fn() };
beforeEach(() => { vi.useFakeTimers(); start.mockReset().mockReturnValue(stop); stop.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
function measure(container: HTMLElement, overflow = 60) {
  const label = container.querySelector('.emoji-card-name')!;
  Object.defineProperties(label, { clientWidth: { value: 100 }, scrollWidth: { value: 100 + overflow } });
}
async function advance(time: number) { await act(async () => { await vi.advanceTimersByTimeAsync(time); }); }

it('waits for deliberate hover, stops on leave, and ignores brief passes', async () => {
  const { container } = render(<EmojiGrid {...props} selectedEmojis={[]} />);
  measure(container);
  const cell = screen.getByRole('gridcell');
  fireEvent.pointerEnter(cell);
  await advance(500);
  fireEvent.pointerLeave(cell);
  await advance(1000);
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerEnter(cell);
  await advance(120);
  await advance(799);
  expect(start).not.toHaveBeenCalled();
  await advance(1);
  expect(start).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(cell);
  expect(stop).toHaveBeenCalledOnce();
});

it('scrolls a selected clipped name without hover, then cancels on deselection', async () => {
  const { container, rerender } = render(<EmojiGrid {...props} selectedEmojis={[emoji]} />);
  measure(container);
  await advance(800);
  expect(start).toHaveBeenCalledOnce();
  rerender(<EmojiGrid {...props} selectedEmojis={[]} />);
  expect(stop).toHaveBeenCalledOnce();
});

it('does not load scrolling behavior for a name that fits', async () => {
  const { container } = render(<EmojiGrid {...props} selectedEmojis={[emoji]} />);
  measure(container, 0);
  await advance(2000);
  expect(start).not.toHaveBeenCalled();
});
