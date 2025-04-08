import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  // Callback to notify parent of search term changes
  onSearchChange: (term: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearchChange }) => {
  const [inputValue, setInputValue] = useState('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value;
    setInputValue(term);
    onSearchChange(term); // Notify parent component
  };

  return (
    // Removed the id="search" wrapper div
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search emojis..."
        className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={inputValue} // Controlled input
        onChange={handleChange} // Update state and notify parent
      />
      {/* Add category dropdown and recent emojis */}
    </div>
  );
};

export default SearchBar;