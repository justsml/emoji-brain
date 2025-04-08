import React, { useState, useEffect, useCallback } from 'react'; // Added useState, useEffect, useCallback
import { useSelector } from 'react-redux';
import type { EmojiMetadata } from '../types/emoji';
import SearchBar from './SearchBar';
import EmojiGrid from './EmojiGrid';
import { EmojiExport } from './EmojiExport';
import { selectSelectedEmojis } from '../store/selectionSlice';
import ReduxProviderWrapper from './ReduxProviderWrapper';

// Define basic types for Pagefind results if official types aren't readily available
// Based on https://pagefind.app/docs/api/
interface PagefindResultData {
  url: string;
  content: string;
  word_count: number;
  filters: Record<string, string[]>;
  meta: Record<string, string>; // Expecting EmojiMetadata fields here
  anchors: {
    element: string;
    id: string;
    location: number;
    text: string;
  }[];
  weighted_locations: {
    weight: number;
    balanced_score: number;
    location: number;
  }[];
  locations: number[];
  raw_content: string;
  raw_url: string;
  excerpt: string;
}

interface PagefindSearchResult {
  id: string;
  score: number;
  words: number[];
  data: () => Promise<PagefindResultData>;
}

interface PagefindSearchResponse {
  results: PagefindSearchResult[];
  unfilteredResultCount: number;
  filters: Record<string, Record<string, number>>;
  totalFilters: Record<string, Record<string, number>>;
  timings: {
    preload: number;
    index_load: number;
    search: number;
  };
}

// Declare pagefind on window for TypeScript
declare global {
  interface Window {
    pagefind?: {
      search: (term: string, options?: Record<string, any>) => Promise<PagefindSearchResponse>;
      options: (options: Record<string, any>) => Promise<void>;
      destroy: () => Promise<void>;
      preload: (term: string, options?: Record<string, any>) => Promise<void>;
      debouncedSearch: (term: string, options?: Record<string, any>) => Promise<PagefindSearchResponse | null>;
      init: () => Promise<void>;
      // Add other methods if needed
    };
  }
}
/*
[
  {
    "url": "/emojis/-1000.png",
    "content": "1000",
    "word_count": 1,
    "filters": {},
    "meta": {},
    "anchors": [],
    "weighted_locations": [
      {
        "weight": 1,
        "balanced_score": 388.63412,
        "location": 0
      }
    ],
    "locations": [
      0
    ],
    "raw_content": "1000",
    "raw_url": "/emojis/-1000.png",
    "excerpt": "<mark>1000</mark>",
    "sub_results": [
      {
        "url": "/emojis/-1000.png",
        "weighted_locations": [
          {
            "weight": 1,
            "balanced_score": 388.63412,
            "location": 0
          }
        ],
        "locations": [
          0
        ],
        "excerpt": "<mark>1000</mark>"
      }
    ]
  },
  {
    "url": "/emojis/1000.png",
    "content": "1000",
    "word_count": 1,
    "filters": {},
    "meta": {},
    "anchors": [],
    "weighted_locations": [
      {
        "weight": 1,
        "balanced_score": 388.63412,
        "location": 0
      }
    ],
    "locations": [
      0
    ],
    "raw_content": "1000",
    "raw_url": "/emojis/1000.png",
    "excerpt": "<mark>1000</mark>",
    "sub_results": [
      {
        "url": "/emojis/1000.png",
        "weighted_locations": [
          {
            "weight": 1,
            "balanced_score": 388.63412,
            "location": 0
          }
        ],
        "locations": [
          0
        ],
        "excerpt": "<mark>1000</mark>"
      }
    ]
  },
  {
    "url": "/emojis/10000.png",
    "content": "10000",
    "word_count": 1,
    "filters": {},
    "meta": {},
    "anchors": [],
    "weighted_locations": [
      {
        "weight": 1,
        "balanced_score": 293.17218,
        "location": 0
      }
    ],
    "locations": [
      0
    ],
    "raw_content": "10000",
    "raw_url": "/emojis/10000.png",
    "excerpt": "<mark>10000</mark>",
    "sub_results": [
      {
        "url": "/emojis/10000.png",
        "weighted_locations": [
          {
            "weight": 1,
            "balanced_score": 293.17218,
            "location": 0
          }
        ],
        "locations": [
          0
        ],
        "excerpt": "<mark>10000</mark>"
      }
    ]
  },
  {
    "url": "/emojis/100000.png",
    "content": "100000",
    "word_count": 1,
    "filters": {},
    "meta": {},
    "anchors": [],
    "weighted_locations": [
      {
        "weight": 1,
        "balanced_score": 242.60703,
        "location": 0
      }
    ],
    "locations": [
      0
    ],
    "raw_content": "100000",
    "raw_url": "/emojis/100000.png",
    "excerpt": "<mark>100000</mark>",
    "sub_results": [
      {
        "url": "/emojis/100000.png",
        "weighted_locations": [
          {
            "weight": 1,
            "balanced_score": 242.60703,
            "location": 0
          }
        ],
        "locations": [
          0
        ],
        "excerpt": "<mark>100000</mark>"
      }
    ]
  }
]
*/

interface EmojiExplorerAppProps {
  initialEmojis: EmojiMetadata[];
}
const pagefindOptions = {
  excerptLength: 50,
  baseUrl: "/",
  "highlightParam": "highlight",
}

const _EmojiExplorerApp: React.FC<EmojiExplorerAppProps> = ({ initialEmojis }) => {
  const selectedEmojis = useSelector(selectSelectedEmojis);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredEmojis, setFilteredEmojis] = useState<EmojiMetadata[]>(initialEmojis); // State for filtered results
  const [isSearching, setIsSearching] = useState(false); // State to indicate search in progress

  // Handler for search term changes from SearchBar
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  // Effect to perform Pagefind search when searchTerm changes
  useEffect(() => {
    const performSearch = async () => {
      if (!window.pagefind) {
        console.error("Pagefind not loaded");
        setFilteredEmojis(initialEmojis); // Fallback to initial list if pagefind fails
        return;
      }

      if (searchTerm.trim() === '') {
        setFilteredEmojis(initialEmojis); // Show all if search is empty
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await window.pagefind.search(searchTerm.trim(), {
          sort: {
            filename: 'asc',
          }
        });
        console.log("Pagefind search results:", searchResults);
        if (searchResults.results.length === 0) {
          setFilteredEmojis([]);
        } else {
          // Map Pagefind results back to EmojiMetadata
          // Assumes Pagefind index meta fields match EmojiMetadata structure
          const emojiDataPromises = searchResults.results.map(result => result.data());
          const emojiDataResults: PagefindResultData[] = await Promise.all(emojiDataPromises);
          const emojis: EmojiMetadata[] = emojiDataResults.map(data => ({
            id: data.meta.id || '',
            filename: data.url || '',
            path: data.raw_url || data.url,
            tags: [],
            created: '',

            categories: data.content?.split(',') || [],
            // created
            size: data.meta.size ? parseInt(data.meta.size, 10) : 0,
            
          }));
          setFilteredEmojis(emojis);
        }
      } catch (error) {
        console.error("Pagefind search error:", error);
        setFilteredEmojis([]); // Show empty on error
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [searchTerm, initialEmojis]); // Rerun on searchTerm or initialEmojis change

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
        {/* Pass the filtered emoji list to EmojiGrid */}
        {/* Add a loading indicator or message while searching */}
        {isSearching ? (
          <p className="text-center text-muted-foreground">Searching...</p>
        ) : (
          <EmojiGrid
            emojis={filteredEmojis}
            // Removed searchTerm prop
            // Pass down selection change handler if needed by EmojiGrid
            // onSelectionChange={(selected) => dispatch(updateSelectionAction(selected))} // Example if needed
          />
        )}
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
      <EmojiExplorerApp initialEmojis={props.initialEmojis} />
    </ReduxProviderWrapper>
  );
};

export default EmojiExplorerWrapper;