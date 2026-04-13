import React from 'react';
import { EmojiProvider } from '../context/EmojiContext';

interface EmojiProviderWrapperProps {
  children: React.ReactNode;
  initialEmojis: any[];
}

const EmojiProviderWrapper: React.FC<EmojiProviderWrapperProps> = ({ children, initialEmojis }) => {
  return <EmojiProvider initialEmojis={initialEmojis}>{children}</EmojiProvider>;
};

export default EmojiProviderWrapper;
