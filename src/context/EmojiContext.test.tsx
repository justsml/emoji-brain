import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
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
  const { selectedEmojis, selectAllVisible, deselectVisible, resetSelection } = useEmojiContext();
  return <>
    <output>{selectedEmojis.map(emoji => emoji.id).join(',')}</output>
    <button onClick={() => selectAllVisible([emojis[0], emojis[1]])}>select first view</button>
    <button onClick={() => selectAllVisible([emojis[2]])}>select second view</button>
    <button onClick={() => deselectVisible([emojis[0]])}>deselect first view</button>
    <button onClick={resetSelection}>clear all</button>
  </>;
}

it('visible selection actions preserve emojis outside the current view', async () => {
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
