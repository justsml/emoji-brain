import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from './SearchBar';
import type { EmojiMetadata } from '../types/emoji';
import { render } from '../test-utils/test-utils';

describe('SearchBar Component', () => {
  const mockOnSearchChange = vi.fn();
  const mockOnEmojiSelect = vi.fn();
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
    // the count reads as "0 results" to assistive tech; only the number is drawn
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/results/)).toBeInTheDocument();
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
  
  it('calls onEmojiSelect when clicking a recent emoji', async () => {
    const recentEmojis: EmojiMetadata[] = [
      { id: '1', filename: 'emoji1.png', path: '/emojis/emoji1.png', categories: ['cat'], tags: ['funny'], created: '2023-01-01', size: 1024 },
    ];
    
    render(
      <SearchBar
        onSearchChange={mockOnSearchChange}
        onEmojiSelect={mockOnEmojiSelect}
        count={0}
        recentEmojis={recentEmojis}
      />
    );
    
    const emojiButton = screen.getByTitle('emoji1.png');
    await userEvent.click(emojiButton);
    
    expect(mockOnEmojiSelect).toHaveBeenCalledWith(recentEmojis[0]);
  });
});

describe('SearchBar share link', () => {
  it('copies the search link once there is a term', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const shareUrl = vi.fn(() => 'https://example.test/?q=cat');
    render(<SearchBar onSearchChange={vi.fn()} count={0} shareUrl={shareUrl} />);

    expect(screen.queryByRole('button', { name: 'Copy link to this search' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Search emojis...'), 'cat');
    const button = screen.getByRole('button', { name: 'Copy link to this search' });
    await userEvent.click(button);
    expect(writeText).toHaveBeenCalledWith('https://example.test/?q=cat');
    expect(screen.getByRole('button', { name: 'Search link copied' })).toBeInTheDocument();
  });

  it('starts from a shared term', () => {
    render(<SearchBar onSearchChange={vi.fn()} count={0} defaultValue="party" shareUrl={() => ''} />);
    expect(screen.getByPlaceholderText('Search emojis...')).toHaveValue('party');
    expect(screen.getByRole('button', { name: 'Copy link to this search' })).toBeInTheDocument();
  });
});
