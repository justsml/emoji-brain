import React, { useState } from 'react';
import { Search } from 'lucide-react';
import type { EmojiMetadata } from '../types/emoji';

interface SearchBarProps {
  // Callback to notify parent of search term changes
  onSearchChange: (term: string) => void;
  // Number of search results
  count: number;
  // Optional props
  categories?: string[];
  recentEmojis?: EmojiMetadata[];
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearchChange, 
  count,
  categories = [],
  recentEmojis = []
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value;
    setInputValue(term);
    onSearchChange(term); // Notify parent component
  };

  const handleEmojiSelect = (emoji: EmojiMetadata) => {
    const event = new CustomEvent('emojiSelect', { detail: emoji });
    document.dispatchEvent(event);
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search emojis..."
        className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={inputValue}
        onChange={handleChange}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {count} results
      </span>
      
      {recentEmojis.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-medium">Recently Used</h3>
          <div className="flex gap-2 mt-1">
            {recentEmojis.map(emoji => (
              <button
                key={emoji.id}
                onClick={() => handleEmojiSelect(emoji)}
                title={emoji.filename}
                className="p-1 hover:bg-accent rounded"
              >
                <img
                  src={emoji.path}
                  alt={emoji.filename}
                  className="w-6 h-6"
                  role="img"
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