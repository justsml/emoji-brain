import React from 'react';
import type { EmojiMetadata } from '../types/emoji';

interface EmojiImageWrapperProps {
  emoji: EmojiMetadata;
  className?: string;
}

const EmojiImageWrapper: React.FC<EmojiImageWrapperProps> = ({ emoji, className }) => {
  // Create a client-side image element that matches the Astro Image component's responsive behavior
  return (
    <img
      src={emoji.path}
      alt={emoji.filename}
      className={className}
      loading="lazy"
      srcSet={`${emoji.path} 24w, ${emoji.path} 32w, ${emoji.path} 64w, ${emoji.path} 128w`}
      sizes="(max-width: 640px) 24px, (max-width: 768px) 32px, (max-width: 1024px) 64px, 128px"
    />
  );
};

export default EmojiImageWrapper;