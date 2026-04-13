import React, { type ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { EmojiProvider } from '../context/EmojiContext';
import type { EmojiMetadata } from '../types/emoji';

interface WrapperProps {
  children: React.ReactNode;
  initialEmojis?: EmojiMetadata[];
}

interface ExtendedRenderOptions {
  initialEmojis?: EmojiMetadata[];
}

function render(
  ui: ReactElement,
  {
    initialEmojis = [],
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return <EmojiProvider initialEmojis={initialEmojis}>{children}</EmojiProvider>;
  }

  return {
    ...rtlRender(ui, {
      wrapper: Wrapper,
      ...renderOptions,
    }),
  };
}

export * from '@testing-library/react';
export { render };
