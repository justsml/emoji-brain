import React, { useState, useCallback, useEffect } from "react";
import type { EmojiMetadata } from "../types/emoji";
import SearchBar from "./SearchBar";
import EmojiGrid from "./EmojiGrid";
import GridScaleSlider from "./GridScaleSlider";
import { EmojiExport } from "./EmojiExport";
import { useEmojiContext } from "../context/EmojiContext";
import ShowSelectedToggle from "./ShowSelectedToggle";
import { ErrorBoundary } from "./ErrorBoundary";
import EmojiProviderWrapper from "./ReduxProviderWrapper";

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

async function pagefindSearch(
  searchTerm: string,
  initialEmojis: EmojiMetadata[],
  onProgress: (loaded: number, total: number) => void,
): Promise<EmojiMetadata[]> {
  const term = searchTerm.trim();
  if (!window.pagefind) {
    const query = term.toLowerCase();
    return initialEmojis.filter((emoji) =>
      [emoji.filename, ...emoji.tags, ...emoji.categories].join(" ").toLowerCase().includes(query)
    );
  }

  const response = await window.pagefind.search(term, { sort: { filename: "asc" } });
  const emojiById = new Map(initialEmojis.map((emoji) => [emoji.id, emoji]));
  let loaded = 0;
  onProgress(loaded, response.results.length);
  return Promise.all(response.results.map(async (result) => {
    const data = await result.data();
    onProgress(++loaded, response.results.length);
    const original = emojiById.get(data.meta.id);
    if (original) return original;
    return {
      id: data.meta.id || "",
      filename: data.url.split("/").pop() || "",
      path: data.raw_url || data.url,
      tags: [],
      created: "",
      categories: data.content?.split(",") || [],
      size: data.meta.size ? parseInt(data.meta.size, 10) : 0,
    };
  }));
}

const _EmojiExplorerApp: React.FC<EmojiExplorerAppProps> = ({
  initialEmojis,
}) => {
  const {
    selectedEmojis,
    filteredEmojis,
    isSearching,
    showSelectedOnly,
    gridScale,
    focusedIndex,
    toggleEmojiSelection,
    setFilteredEmojis,
    setIsSearching,
    setFocusedIndex,
    announceSelection,
    resetSelection,
    selectAllVisible,
  } = useEmojiContext();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState(initialEmojis);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchProgress, setSearchProgress] = useState<number | undefined>();

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: EmojiMetadata) => {
      toggleEmojiSelection(emoji);
    },
    [toggleEmojiSelection],
  );

  const handleResetSelection = useCallback(() => {
    resetSelection();
  }, [resetSelection]);

  useEffect(() => {
    let current = true;
    if (searchTerm.trim() === "") {
      setSearchResults(initialEmojis);
      setIsSearching(false);
      setSearchStatus("");
      setSearchProgress(undefined);
      return;
    }

    setIsSearching(true);
    setSearchStatus(`Finding matches for “${searchTerm.trim()}”…`);
    setSearchProgress(undefined);
    pagefindSearch(searchTerm, initialEmojis, (loaded, total) => {
      if (!current) return;
      setSearchStatus(`Preparing ${loaded.toLocaleString()} of ${total.toLocaleString()} matches…`);
      setSearchProgress(total > 0 ? Math.round(loaded / total * 100) : 100);
    }).then((results) => {
      if (!current) return;
      setSearchResults(results);
      setSearchStatus(`${results.length.toLocaleString()} matches for “${searchTerm.trim()}”`);
    }).catch((error) => {
      if (!current) return;
      console.error("Pagefind search error:", error);
      setSearchStatus("Search couldn’t finish. Your previous results are still here. Try searching again.");
    }).finally(() => {
      if (current) setIsSearching(false);
    });
    return () => { current = false; };
  }, [searchTerm, initialEmojis, setIsSearching]);

  useEffect(() => {
    setFilteredEmojis(showSelectedOnly
      ? searchResults.filter((emoji) => selectedEmojis.some((selected) => selected.id === emoji.id))
      : searchResults);
  }, [searchResults, showSelectedOnly, selectedEmojis, setFilteredEmojis]);

  const handleAnnounceSelection = useCallback((emoji: EmojiMetadata, isSelected: boolean) => {
    announceSelection(emoji, isSelected);
  }, [announceSelection]);

  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen">
        <div className="container mx-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-[200px]">
              <SearchBar
                onSearchChange={handleSearchChange}
                onEmojiSelect={handleEmojiSelect}
                count={filteredEmojis.length}
                isSearching={isSearching}
                status={searchStatus}
                progress={searchProgress}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <ShowSelectedToggle />
            <GridScaleSlider />
          </div>
        </div>
      </div>

      <section className="w-full" aria-label="Emoji results" aria-busy={isSearching}>
          <EmojiGrid
            emojis={filteredEmojis}
            selectedEmojis={selectedEmojis}
            focusedIndex={focusedIndex}
            gridScale={gridScale}
            onToggleSelection={handleEmojiSelect}
            onSetFocusedIndex={setFocusedIndex}
            onAnnounceSelection={handleAnnounceSelection}
          />
      </section>

      <div className="container mx-auto p-4">
        <EmojiExport
          selectedEmojis={selectedEmojis}
          onClearSelection={handleResetSelection}
          onSelectAll={() => selectAllVisible(filteredEmojis)}
          filteredEmojis={filteredEmojis}
          gridScale={gridScale}
          onRemoveEmoji={handleEmojiSelect}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
};

const EmojiExplorerWrapper = (
  props: Omit<EmojiExplorerAppProps, "categories">
) => {
  return (
    <EmojiProviderWrapper initialEmojis={props.initialEmojis}>
      <_EmojiExplorerApp initialEmojis={props.initialEmojis} />
    </EmojiProviderWrapper>
  );
};

export default EmojiExplorerWrapper;
