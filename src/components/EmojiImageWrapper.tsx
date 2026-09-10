import React from 'react';
import {emojiAsset, previewSrcSet} from '../lib/emojiAssets';
import type { EmojiMetadata } from '../types/emoji';

interface EmojiImageWrapperProps {
  emoji: EmojiMetadata;
  className?: string;
}

const EmojiImageWrapper: React.FC<EmojiImageWrapperProps> = ({ emoji, className }) => {
  // Create a client-side image element that matches the Astro Image component's responsive behavior
  return (
    <img
      src={emojiAsset(emoji.filename, 128, true)}
      alt={emoji.filename}
      className={className}
      loading="lazy"
      decoding="async"
      width={128}
      height={128}
      srcSet={previewSrcSet(emoji.filename)}
      sizes="(max-width: 640px) 24px, (max-width: 768px) 32px, (max-width: 1024px) 64px, 128px"
    />
  );
};

export default EmojiImageWrapper;