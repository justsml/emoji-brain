import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from './SearchBar';
import type { EmojiMetadata } from '../types/emoji';

describe('SearchBar Component', () => {
  const mockOnSearchChange = vi.fn();
  const mockCategories = ['cat', 'dog', 'meme'];
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders correctly', () => {
    render(
      <SearchBar
        onSearchChange={mockOnSearchChange}
        count={0}
        categories={mockCategories}
      />
    );
    
    expect(screen.getByPlaceholderText('Search emojis...')).toBeInTheDocument();
    expect(screen.getByText('0 results')).toBeInTheDocument();
  });
  
  it('calls onSearchChange when typing in the search input', async () => {
    render(
      <SearchBar
        onSearchChange={mockOnSearchChange}
        count={0}
      />
    );
    
    const searchInput = screen.getByPlaceholderText('Search emojis...');
    await userEvent.type(searchInput, 'cat');
    
    expect(mockOnSearchChange).toHaveBeenCalledWith('cat');
  });
  
  it('displays recent emojis when provided', () => {
    const recentEmojis: EmojiMetadata[] = [
      { id: '1', filename: 'emoji1.png', path: '/emojis/emoji1.png', categories: ['cat'], tags: ['funny'], created: '2023-01-01', size: 1024 },
      { id: '2', filename: 'emoji2.png', path: '/emojis/emoji2.png', categories: ['dog'], tags: ['cute'], created: '2023-01-02', size: 2048 },
    ];
    
    render(
      <SearchBar
        onSearchChange={mockOnSearchChange}
        count={0}
        recentEmojis={recentEmojis}
      />
    );
    
    expect(screen.getByText('Recently Used')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
  
  it('dispatches emojiSelect event when clicking a recent emoji', async () => {
    const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');
    
    const recentEmojis: EmojiMetadata[] = [
      { id: '1', filename: 'emoji1.png', path: '/emojis/emoji1.png', categories: ['cat'], tags: ['funny'], created: '2023-01-01', size: 1024 },
    ];
    
    render(
      <SearchBar
        onSearchChange={mockOnSearchChange}
        count={0}
        recentEmojis={recentEmojis}
      />
    );
    
    const emojiButton = screen.getByTitle('emoji1.png');
    await userEvent.click(emojiButton);
    
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    expect(dispatchEventSpy.mock.calls[0][0].type).toBe('emojiSelect');
    expect((dispatchEventSpy.mock.calls[0][0] as CustomEvent).detail).toEqual(recentEmojis[0]);
  });
});