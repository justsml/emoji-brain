import React, { useState, useEffect } from 'react'; // Added useState
// Removed useSelector, useDispatch imports related to search
import { useSelector } from 'react-redux';
import type { EmojiMetadata } from '../types/emoji';
import SearchBar from './SearchBar';
import EmojiGrid from './EmojiGrid';
import { EmojiExport } from './EmojiExport';
// Removed searchSlice imports
import { selectSelectedEmojis } from '../store/selectionSlice'; // Keep selection imports
import ReduxProviderWrapper from './ReduxProviderWrapper';

interface EmojiExplorerAppProps {
  initialEmojis: EmojiMetadata[];
  // Removed categories prop as it's no longer used by SearchBar
}
const pagefindOptions = {
  excerptLength: 50,
  baseUrl: "/",
  "highlightParam": "highlight",
}

const _EmojiExplorerApp: React.FC<EmojiExplorerAppProps> = ({ initialEmojis }) => {
  // Removed dispatch and search-related useSelector calls
  const selectedEmojis = useSelector(selectSelectedEmojis); // Keep selection state
  const [searchTerm, setSearchTerm] = useState(''); // State for the search term

  // Handler for search term changes from SearchBar
  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
  };

  // Removed the Redux-based filtering logic (useMemo)
  // EmojiGrid now handles filtering internally using Pagefind

  // Example: Dispatch an action on mount if needed (e.g., for selection initialization)
  // useEffect(() => {
  //   // If selection needs initialization from local storage via Redux, keep dispatch
  //   // const dispatch = useDispatch();
  //   // dispatch(initializeSelectionFromStorage()); // Example action
  // }, []);

  return (
    <div className="space-y-8">
      <div className="max-w-5xl mx-auto">
        {/* Pass the handler to SearchBar */}
        <SearchBar onSearchChange={handleSearchChange} />
      </div>

      <section className="max-w-7xl mx-auto">
        {/* Pass the full emoji list and the current search term to EmojiGrid */}
        <EmojiGrid
          emojis={initialEmojis}
          searchTerm={searchTerm}
          // Pass down selection change handler if needed by EmojiGrid (it wasn't previously, but good practice)
          // onSelectionChange={(selected) => dispatch(updateSelectionAction(selected))} // Example if needed
        />
      </section>

      {/* EmojiExport still uses Redux for selectedEmojis */}
      <EmojiExport />
    </div>
  );
};


// Update the wrapper props type
const EmojiExplorerWrapper = (props: Omit<EmojiExplorerAppProps, 'categories'>) => {
  const EmojiExplorerApp = _EmojiExplorerApp;
  return (
    <ReduxProviderWrapper>
      {/* Pass only the required props */}
      <EmojiExplorerApp initialEmojis={props.initialEmojis} />;
    </ReduxProviderWrapper>
  );
};

export default EmojiExplorerWrapper;