import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimilarStrip from './SimilarStrip';
import SimilarStripLoader from './SimilarStripLoader';
import type { EmojiMetadata } from '../types/emoji';

const emoji = (id: string): EmojiMetadata => ({ id, filename: `${id}.png`, path: `/emojis/${id}.png`, categories: [], tags: [], created: '2023-01-01', size: 1 });
const catalog = ['a', 'b', 'c', 'd'].map(emoji);
const [a, b, c] = catalog;

// A stand-in similarity worker that answers (or misbehaves) on demand.
let reply: (message: { sourceId: string }) => unknown;
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { workers.push(this); }
  postMessage(message: { sourceId: string }) {
    const data = reply(message);
    if (data !== undefined) queueMicrotask(() => this.onmessage?.({ data }));
  }
  terminate() { this.terminated = true; }
}

function setup(props: Partial<React.ComponentProps<typeof SimilarStrip>> = {}) {
  const handlers = { onToggle: vi.fn(), onSimilar: vi.fn(), onClose: vi.fn() };
  const view = render(<SimilarStrip catalog={catalog} selected={[]} source={a} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

beforeEach(() => {
  workers.length = 0;
  reply = ({ sourceId }) => ({ sourceId, ids: ['b', 'c'] });
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('SimilarStrip', () => {
  it('is a labelled region naming the source, listing related stickers as pressable buttons', async () => {
    setup({ selected: [c] });
    const region = screen.getByRole('region', { name: 'Stickers similar to a' });
    expect(region).toHaveTextContent('Similar to a');
    expect(await screen.findByRole('button', { name: 'b.png' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'c.png' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(region).queryByRole('button', { name: 'a.png' })).toBeNull();
  });

  it('toggles a sticker when tapped', async () => {
    const { onToggle } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'b.png' }));
    expect(onToggle).toHaveBeenCalledWith(b);
  });

  it('chains to similar-to-this and moves focus to the new first sticker', async () => {
    const user = userEvent.setup();
    const { onSimilar, rerender, onToggle, onClose } = setup();
    await user.click(await screen.findByRole('button', { name: 'Similar to b.png' }));
    expect(onSimilar).toHaveBeenCalledWith(b);
    rerender(<SimilarStrip catalog={catalog} selected={[]} source={b} onToggle={onToggle} onSimilar={onSimilar} onClose={onClose} />);
    expect(await screen.findByRole('region', { name: 'Stickers similar to b' })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'b.png' })).toHaveFocus());
    // The worker is reused; only the first request carries the catalog.
    expect(workers).toHaveLength(1);
  });

  it('shows loading, then an empty note', async () => {
    reply = ({ sourceId }) => ({ sourceId, ids: [] });
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Finding related stickers');
    expect(await screen.findByText('No related stickers for this one yet.')).toBeInTheDocument();
  });

  it.each([
    ['null', () => null],
    ['bad ids', ({ sourceId }: { sourceId: string }) => ({ sourceId, ids: [1] })],
  ])('reports an invalid worker reply (%s) as an error and retries', async (_name, bad) => {
    reply = bad as typeof reply;
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load');
    expect(workers[0].terminated).toBe(true);
    reply = ({ sourceId }) => ({ sourceId, ids: ['b'] });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'b.png' })).toBeInTheDocument();
  });

  it('fails when the worker cannot start', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('nope'); } });
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('fails when the worker never answers', async () => {
    vi.useFakeTimers();
    try {
      reply = () => undefined;
      setup();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  describe('dismissal and focus', () => {
    it('focuses the close button on open and closes on Escape, ✕ and outside taps', async () => {
      const { onClose } = setup();
      expect(screen.getByRole('button', { name: 'Close similar stickers' })).toHaveFocus();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole('button', { name: 'Close similar stickers' }));
      expect(onClose).toHaveBeenCalledTimes(2);
      fireEvent.pointerDown(document.body);
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('stays open for taps inside it, on the tray, and on a card’s Similar action', async () => {
      const { onClose } = setup();
      document.body.insertAdjacentHTML('beforeend', '<div class="sheet-tray"><button id="t">t</button></div><div class="emoji-card-actions"><button id="s">s</button></div>');
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'b.png' }));
      fireEvent.pointerDown(document.getElementById('t')!);
      fireEvent.pointerDown(document.getElementById('s')!);
      expect(onClose).not.toHaveBeenCalled();
      document.querySelector('.sheet-tray')!.remove();
      document.querySelector('.emoji-card-actions')!.remove();
    });

    it('returns focus to what had it when it opened', () => {
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const { unmount } = setup();
      expect(opener).not.toHaveFocus();
      unmount();
      expect(opener).toHaveFocus();
      opener.remove();
    });
  });
});

describe('SimilarStripLoader', () => {
  it('loads the strip lazily', async () => {
    render(<SimilarStripLoader catalog={catalog} selected={[]} source={a} onToggle={vi.fn()} onSimilar={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('region', { name: 'Stickers similar to a' })).toBeInTheDocument();
  });
});
