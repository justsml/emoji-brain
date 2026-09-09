import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EmojiExplorerApp from './EmojiExplorerApp';

vi.mock('./EmojiGrid', () => ({ default: ({ emojis, selectedEmojis, onToggleSelection }: any) => (
  <div>{emojis.map((emoji: any) => <button key={emoji.id} onClick={() => onToggleSelection(emoji)} aria-pressed={selectedEmojis.some((selected: any) => selected.id === emoji.id)}>{emoji.filename}</button>)}</div>
) }));
vi.mock('./EmojiExport', () => ({ EmojiExport: () => null }));
vi.mock('./GridScaleSlider', () => ({ default: () => null }));
const initial = [{ id: 'original', filename: 'original.png', path: '/original.png', tags: [], categories: [], created: '', size: 1 }];
const deferred = () => {
  let resolve!: (value: any) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (name: string) => ({ results: [{ data: async () => ({ meta: { id: name }, url: `${name}.png`, raw_url: `/${name}.png` }) }] });
afterEach(() => { delete window.pagefind; localStorage.clear(); vi.restoreAllMocks(); });

it('keeps previous results mounted, reports preparation, and ignores late searches', async () => {
  const first = deferred();
  const second = deferred();
  const metadata = deferred();
  window.pagefind = { search: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) } as any;
  render(<EmojiExplorerApp initialEmojis={initial} />);
  const input = screen.getByRole('searchbox');
  const original = screen.getByRole('button', { name: 'original.png' });
  fireEvent.change(input, { target: { value: 'first' } });
  expect(original).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'second' } });
  await act(async () => second.resolve({ results: [{ data: () => metadata.promise }] }));
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(original).toBeInTheDocument();
  await act(async () => metadata.resolve({ meta: { id: 'second' }, url: 'second.png', raw_url: '/second.png' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'second.png' })).toBeInTheDocument());
  await act(async () => first.resolve(response('first')));
  expect(screen.queryByRole('button', { name: 'first.png' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'second.png' }));
  expect(screen.getByRole('button', { name: 'second.png' })).toHaveAttribute('aria-pressed', 'true');
  expect(window.pagefind.search).toHaveBeenCalledTimes(2);
});

it('retains results on failure and clearing invalidates a pending request', async () => {
  const failing = deferred();
  const pending = deferred();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.pagefind = { search: vi.fn().mockReturnValueOnce(failing.promise).mockReturnValueOnce(pending.promise) } as any;
  render(<EmojiExplorerApp initialEmojis={initial} />);
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: 'failure' } });
  await act(async () => failing.reject(new Error('offline')));
  expect(screen.getByRole('status')).toHaveTextContent('previous results are still here');
  expect(screen.getByRole('button', { name: 'original.png' })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'pending' } });
  fireEvent.change(input, { target: { value: '' } });
  await act(async () => pending.resolve(response('pending')));
  expect(screen.getByRole('button', { name: 'original.png' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'pending.png' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Emoji results' })).toHaveAttribute('aria-busy', 'false');
});

it('can search local metadata before the index is available', async () => {
  render(<EmojiExplorerApp initialEmojis={initial} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'original.png' })).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'original' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'original.png' })).toBeInTheDocument());
});

it('keeps original filenames and paths for indexed matches', async () => {
  window.pagefind = { search: vi.fn().mockResolvedValue({ results: [{ data: async () => ({ meta: { id: 'original' }, url: '/emojis/original.png/', raw_url: '/search-document/' }) }] }) } as any;
  render(<EmojiExplorerApp initialEmojis={initial} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'original' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 matches'));
  expect(screen.getByRole('button', { name: 'original.png' })).toBeInTheDocument();
});
