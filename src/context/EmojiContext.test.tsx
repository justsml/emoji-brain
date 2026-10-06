import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import * as selectionStorage from '../lib/selectionStorage';
import { EmojiProvider, useEmojiContext } from './EmojiContext';
import type { EmojiMetadata } from '../types/emoji';

const emojis: EmojiMetadata[] = ['one', 'two', 'three'].map((id) => ({
  id,
  filename: `${id}.webp`,
  path: `/emojis/${id}.webp`,
  categories: [],
  tags: [],
  created: '2026-01-01',
  size: 1,
}));

function Harness() {
  const { selectedEmojis, selectAllVisible, deselectVisible, invertVisible, resetSelection } = useEmojiContext();
  return <>
    <output>{selectedEmojis.map(emoji => emoji.id).join(',')}</output>
    <button onClick={() => selectAllVisible([emojis[0], emojis[1]])}>select first view</button>
    <button onClick={() => selectAllVisible([emojis[2]])}>select second view</button>
    <button onClick={() => deselectVisible([emojis[0]])}>deselect first view</button>
    <button onClick={resetSelection}>clear all</button>
    <button onClick={() => invertVisible([emojis[0], emojis[1]])}>invert first view</button>
  </>;
}

it('starts a first visit with nothing selected, and keeps a returning selection', () => {
  localStorage.clear();
  const first = render(<EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>);
  expect(screen.getByText('', {selector: 'output'})).toBeInTheDocument();
  first.unmount();
  localStorage.setItem(selectionStorage.SELECTION_STORAGE_KEY, JSON.stringify(['two']));
  render(<EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>);
  expect(screen.getByText('two', {selector: 'output'})).toBeInTheDocument();
});

it('hydrates a server render without a mismatch, then restores the stored sheet before paint', async () => {
  localStorage.clear(); // the server has no storage
  const tree = <EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>;
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  localStorage.setItem(selectionStorage.SELECTION_STORAGE_KEY, JSON.stringify(['two']));
  const errors: unknown[] = [];
  const root = await act(async () => hydrateRoot(container, tree, {onRecoverableError: error => errors.push(error)}));
  try {
    expect(errors).toEqual([]);
    expect(container.querySelector('output')?.textContent).toBe('two');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('inverts a mixed visible selection atomically and preserves hidden selections', async () => {
  localStorage.setItem(selectionStorage.SELECTION_STORAGE_KEY, JSON.stringify(['one', 'three']));
  const user = userEvent.setup();
  render(<EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>);
  await user.click(screen.getByRole('button', {name: 'invert first view'}));
  expect(screen.getByText('three,two', {selector: 'output'})).toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: 'invert first view'}));
  expect(screen.getByText('three,one', {selector: 'output'})).toBeInTheDocument();
});

it('visible selection actions preserve emojis outside the current view', async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>);

  await user.click(screen.getByRole('button', { name: 'select first view' }));
  await user.click(screen.getByRole('button', { name: 'select second view' }));
  expect(screen.getByText('one,two,three')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'deselect first view' }));
  expect(screen.getByText('two,three')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'clear all' }));
  expect(screen.getByText('', { selector: 'output' })).toBeInTheDocument();
});


it('reconciles persisted catalog records only when initializing the provider', async () => {
  localStorage.setItem(selectionStorage.SELECTION_STORAGE_KEY, JSON.stringify(['one']));
  const reconcile = vi.spyOn(selectionStorage, 'reconcileSelection');
  try {
    const user = userEvent.setup();
    render(<EmojiProvider initialEmojis={emojis}><Harness /></EmojiProvider>);
    expect(screen.getByText('one', {selector: 'output'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'select second view'}));
    expect(screen.getByText('one,three')).toBeInTheDocument();
    expect(reconcile).toHaveBeenCalledTimes(1);
  } finally {reconcile.mockRestore();}
});


it('does not rerender consumers just to mirror selection into persistence', async () => {
  localStorage.clear();
  const rendered = vi.fn();
  function Consumer() {
    const {selectedEmojis, toggleEmojiSelection} = useEmojiContext();
    rendered();
    return <button onClick={() => toggleEmojiSelection(emojis[0])}>{selectedEmojis.length} on sheet</button>;
  }
  const user = userEvent.setup();
  render(<EmojiProvider initialEmojis={emojis}><Consumer /></EmojiProvider>);
  expect(rendered).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', {name: '0 on sheet'}));
  expect(screen.getByRole('button', {name: '1 on sheet'})).toBeInTheDocument();
  expect(rendered).toHaveBeenCalledTimes(2);
});


it('ignores repeated search, focus and size values without notifying consumers', async () => {
  localStorage.clear();
  const rendered = vi.fn();
  function Consumer() {
    const context = useEmojiContext();
    rendered();
    return <button onClick={() => {
      context.setIsSearching(false);
      context.setFocusedIndex(0);
      context.setGridScale(0);
      context.setShowSelectedOnly(false);
      context.setFilteredEmojis(emojis);
    }}>repeat current values</button>;
  }
  const user = userEvent.setup();
  render(<EmojiProvider initialEmojis={emojis}><Consumer /></EmojiProvider>);
  await user.click(screen.getByRole('button', {name: 'repeat current values'}));
  expect(rendered).toHaveBeenCalledTimes(1);
});
