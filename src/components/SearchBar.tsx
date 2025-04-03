import React from 'react'; // Removed useState, useEffect
import { useSelector, useDispatch } from 'react-redux';
import type { EmojiMetadata } from '../types/emoji';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown, Search } from 'lucide-react';
import {
  setSearchQuery,
  setSelectedCategory,
  selectSearchQuery,
  selectSelectedCategory,
  selectRecentEmojis,
} from '../store/searchSlice';
import { toggleEmojiSelection } from '../store/selectionSlice'; // For recent emoji click
import type { AppDispatch } from '../store/store'; // Import AppDispatch type

interface SearchBarProps {
  // Removed onSearch, onCategorySelect, recentEmojis
  categories: string[];
}

const SearchBar: React.FC<SearchBarProps> = ({ categories }) => {
  const dispatch = useDispatch<AppDispatch>(); // Use typed dispatch
  const searchQuery = useSelector(selectSearchQuery);
  const selectedCategory = useSelector(selectSelectedCategory);
  const recentEmojis = useSelector(selectRecentEmojis); // Get recent emojis from Redux

  // Removed useEffect for event listener

  const handleSearch = (value: string) => {
    dispatch(setSearchQuery(value));
  };

  const handleCategorySelect = (category: string) => {
    dispatch(setSelectedCategory(category));
  };

  // When a recent emoji is clicked, treat it as a selection toggle
  const handleRecentEmojiClick = (emoji: EmojiMetadata) => {
    dispatch(toggleEmojiSelection(emoji));
    // Optionally, you might want to clear the search query or category here
    // dispatch(setSearchQuery(''));
    // dispatch(setSelectedCategory('all'));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search emojis..."
            className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={searchQuery} // Controlled by Redux state
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[130px] justify-between">
              {/* Wrap children in a single element */}
              <span className="flex items-center justify-between w-full">
                {selectedCategory === 'all' ? 'All Categories' : selectedCategory}
                <ChevronDown className="ml-2 h-4 w-4" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[130px]">
            <DropdownMenuItem onClick={() => handleCategorySelect('all')}>
              All Categories
            </DropdownMenuItem>
            {categories.map((category) => (
              <DropdownMenuItem
                key={category}
                onClick={() => handleCategorySelect(category)}
              >
                {category}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Display recent emojis from Redux state */}
      {recentEmojis.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Recently Used</h3>
          <div className="flex gap-2 overflow-x-auto pb-2"> {/* Added scroll */}
            {recentEmojis.map((emoji) => (
              <button
                key={emoji.id}
                className="flex-shrink-0 rounded-lg border bg-card p-2 hover:bg-accent transition-colors"
                title={emoji.filename}
                onClick={() => handleRecentEmojiClick(emoji)} // Dispatch selection toggle
              >
                <img
                  src={emoji.path.startsWith('/') ? emoji.path : `/${emoji.path}`}
                  alt={emoji.filename}
                  className="h-6 w-6 object-contain"
                  loading="lazy"
                  onError={(e) => {
                    console.error(`Failed to load image: ${emoji.path}`);
                    e.currentTarget.src = '/favicon.svg'; // Fallback image
                  }}
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