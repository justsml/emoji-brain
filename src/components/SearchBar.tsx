import React, { useState } from 'react';
import '../styles/search.css';
import { Search } from 'lucide-react';
import type { EmojiMetadata } from '../types/emoji';

interface SearchBarProps {
  // Callback to notify parent of search term changes
  onSearchChange: (term: string) => void;
  // Callback to notify parent of emoji selection
  onEmojiSelect?: (emoji: EmojiMetadata) => void;
  // Number of search results
  count: number;
  isSearching?: boolean;
  status?: string;
  progress?: number;
  // Optional props
  categories?: string[];
  recentEmojis?: EmojiMetadata[];
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearchChange,
  onEmojiSelect,
  count,
  isSearching = false,
  status = "",
  progress,
  recentEmojis = []
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value;
    setInputValue(term);
    onSearchChange(term); // Notify parent component
  };

  const handleEmojiSelect = (emoji: EmojiMetadata) => {
    if (onEmojiSelect) {
      onEmojiSelect(emoji);
    }
  };

  return (
    <div className="emoji-search">
      <div className={`emoji-search-shell ${isSearching ? 'is-searching' : ''}`}>
        <Search className="emoji-search-icon" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search emojis"
          aria-describedby="emoji-search-status"
          placeholder="Search emojis..."
          className="emoji-search-input"
          value={inputValue}
          onChange={handleChange}
        />
        <span className="emoji-search-count">{count.toLocaleString()}</span>

        {isSearching && progress !== undefined && (
          <div className="emoji-search-progress" role="progressbar" aria-label="Preparing search matches"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div id="emoji-search-status" role="status" className="emoji-search-status">
        {status}
      </div>
      {recentEmojis.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-medium">Recently Used</h3>
          <div className="flex gap-2 mt-1">
            {recentEmojis.map(emoji => (
              <button
                key={emoji.id}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                title={emoji.filename}
                className="p-1 hover:bg-accent rounded"
              >
                <img
                  src={emoji.path}
                  alt={emoji.filename}
                  className="w-6 h-6"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
