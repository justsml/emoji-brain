import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmojiGrid from './EmojiGrid';
import type { EmojiMetadata } from '../types/emoji';
import { render } from '../test-utils/test-utils';

if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  }
  (window as any).PointerEvent = PointerEvent;
}

describe('EmojiGrid Component', () => {
  const mockEmojis: EmojiMetadata[] = [
    { id: '1', filename: 'emoji1.png', path: '/emojis/emoji1.png', categories: ['cat'], tags: ['funny'], created: '2023-01-01', size: 1024 },
    { id: '2', filename: 'emoji2.png', path: '/emojis/emoji2.png', categories: ['dog'], tags: ['cute'], created: '2023-01-02', size: 2048 },
    { id: '3', filename: 'emoji3.png', path: '/emojis/emoji3.png', categories: ['meme'], tags: ['funny', 'reaction'], created: '2023-01-03', size: 3072 },
  ];
  
  const mockOnSelectionChange = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  
  it('renders the correct number of emojis', () => {
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    expect(emojiImages).toHaveLength(mockEmojis.length);
  });
  
  it('displays emoji images with correct attributes', () => {
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    expect(emojiImages).toHaveLength(mockEmojis.length);
    
    emojiImages.forEach((img, index) => {
      expect(img).toHaveAttribute('src', mockEmojis[index].path);
      expect(img).toHaveAttribute('alt', mockEmojis[index].filename);
    });
  });
  
  it('calls onToggleSelection when an emoji is clicked', async () => {
    const mockToggle = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={mockToggle}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    await userEvent.click(emojiImages[0]);
    
    expect(mockToggle).toHaveBeenCalled();
    expect(mockToggle.mock.calls[0][0]).toEqual(mockEmojis[0]);
  });
  
  it('calls onSetFocusedIndex on keyboard navigation', async () => {
    const mockFocusChange = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={mockFocusChange}
      onAnnounceSelection={() => {}}
    />);
    
    const buttons = screen.getAllByRole('button', { name: /emoji/i });
    
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
  });
  
  it('calls onToggleSelection and onAnnounceSelection with Enter key', async () => {
    const mockToggle = vi.fn();
    const mockAnnounce = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={mockToggle}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={mockAnnounce}
    />);
    
    const button = screen.getByRole('button', { name: 'emoji1.png' });
    
    button.focus();
    await userEvent.keyboard('{Enter}');
    
    expect(mockToggle).toHaveBeenCalled();
  });
});
