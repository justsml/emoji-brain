import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { EmojiMetadata } from '../types/emoji';
import SearchBar from './SearchBar';
import EmojiGrid from './EmojiGrid';
import { EmojiExport } from './EmojiExport';
import { selectSelectedEmojis } from '../store/selectionSlice';
import {
  selectFilteredEmojis,
  selectIsSearching,
  selectShowSelectedOnly,
  setFilteredEmojis,
  setIsSearching
} from '../store/filteredEmojisSlice';
import ShowSelectedToggle from './ShowSelectedToggle';
import ReduxProviderWrapper from './ReduxProviderWrapper';

// Pagefind types remain unchanged...
interface PagefindResultData {
  url: string;
  content: string;
  word_count: number;
  filters: Record<string, string[]>;
  meta: Record<string, string>;
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

declare global {
  interface Window {
    pagefind?: {
      search: (term: string, options?: Record<string, any>) => Promise<PagefindSearchResponse>;
      options: (options: Record<string, any>) => Promise<void>;
      destroy: () => Promise<void>;
      preload: (term: string, options?: Record<string, any>) => Promise<void>;
      debouncedSearch: (term: string, options?: Record<string, any>) => Promise<PagefindSearchResponse | null>;
      init: () => Promise<void>;
    };
  }
}

interface EmojiExplorerAppProps {
  initialEmojis: EmojiMetadata[];
}

const _EmojiExplorerApp: React.FC<EmojiExplorerAppProps> = ({ initialEmojis }) => {
  const dispatch = useDispatch();
  const selectedEmojis = useSelector(selectSelectedEmojis);
  const filteredEmojis = useSelector(selectFilteredEmojis);
  const isSearching = useSelector(selectIsSearching);
  const showSelectedOnly = useSelector(selectShowSelectedOnly);
  const [searchTerm, setSearchTerm] = useState('');

  // Handler for search term changes from SearchBar
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  // Effect to perform Pagefind search when searchTerm changes
  useEffect(() => {
    const performSearch = async () => {
      if (!window.pagefind) {
        console.error("Pagefind not loaded");
        dispatch(setFilteredEmojis(initialEmojis));
        return;
      }
if (searchTerm.trim() === '') {
  const emojis = showSelectedOnly
    ? initialEmojis.filter(emoji => selectedEmojis.some(selected => selected.id === emoji.id))
    : initialEmojis;
  dispatch(setFilteredEmojis(emojis));
  dispatch(setIsSearching(false));
  return;
}


      dispatch(setIsSearching(true));
      try {
        const searchResults = await window.pagefind.search(searchTerm.trim(), {
          sort: {
            filename: 'asc',
          }
        });
        console.log("Pagefind search results:", searchResults);
        if (searchResults.results.length === 0) {
          dispatch(setFilteredEmojis([]));
        } else {
          const emojiDataPromises = searchResults.results.map(result => result.data());
          const emojiDataResults: PagefindResultData[] = await Promise.all(emojiDataPromises);
          const emojis: EmojiMetadata[] = emojiDataResults.map(data => ({
            id: data.meta.id || '',
            filename: data.url || '',
            path: data.raw_url || data.url,
            tags: [],
            created: '',
            categories: data.content?.split(',') || [],
            size: data.meta.size ? parseInt(data.meta.size, 10) : 0,
          }));
          const filteredResults = showSelectedOnly
            ? emojis.filter(emoji => selectedEmojis.some(selected => selected.id === emoji.id))
            : emojis;
          dispatch(setFilteredEmojis(filteredResults));
        }
      } catch (error) {
        console.error("Pagefind search error:", error);
        dispatch(setFilteredEmojis([]));
      } finally {
        dispatch(setIsSearching(false));
      }
    };

    performSearch();
  }, [searchTerm, initialEmojis, dispatch, showSelectedOnly, selectedEmojis]);

  return (
    <div className="container mx-auto p-4">
      <div className="mx-auto max-w-sm space-y-4">
        <SearchBar onSearchChange={handleSearchChange} count={filteredEmojis.length} />
        <ShowSelectedToggle />
      </div>

      <section className="mx-auto max-w-full">
        {isSearching ? (
          <p className="text-center text-muted-foreground">Searching...</p>
        ) : (
          <EmojiGrid
            emojis={filteredEmojis}
          />
        )}
      </section>

      <EmojiExport />
    </div>
  );
};

const EmojiExplorerWrapper = (props: Omit<EmojiExplorerAppProps, 'categories'>) => {
  const EmojiExplorerApp = _EmojiExplorerApp;
  return (
    <ReduxProviderWrapper>
      <EmojiExplorerApp initialEmojis={props.initialEmojis} />
    </ReduxProviderWrapper>
  );
};

export default EmojiExplorerWrapper;