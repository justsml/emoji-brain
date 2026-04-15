import React, { useState, useCallback, useEffect, use, Suspense } from "react";
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

function pagefindSearch(searchTerm: string, initialEmojis: EmojiMetadata[], showSelectedOnly: boolean, selectedEmojis: EmojiMetadata[]): Promise<EmojiMetadata[]> {
  if (!window.pagefind) {
    return Promise.resolve(initialEmojis);
  }
  
  if (searchTerm.trim() === "") {
    const emojis = showSelectedOnly
      ? initialEmojis.filter((emoji) =>
          selectedEmojis.some((selected) => selected.id === emoji.id)
        )
      : initialEmojis;
    return Promise.resolve(emojis);
  }

  return window.pagefind.search(searchTerm.trim(), {
    sort: {
      filename: "asc",
    },
  }).then((searchResults) => {
    if (searchResults.results.length === 0) {
      return [];
    }
    
    const emojiDataPromises = searchResults.results.map((result) =>
      result.data()
    );
    return Promise.all(emojiDataPromises).then((emojiDataResults: PagefindResultData[]) => {
      const emojis: EmojiMetadata[] = emojiDataResults.map((data) => ({
        id: data.meta.id || "",
        filename: data.url || "",
        path: data.raw_url || data.url,
        tags: [],
        created: "",
        categories: data.content?.split(",") || [],
        size: data.meta.size ? parseInt(data.meta.size, 10) : 0,
      }));
      
      return showSelectedOnly
        ? emojis.filter((emoji) =>
            selectedEmojis.some((selected) => selected.id === emoji.id)
          )
        : emojis;
    });
  }).catch((error) => {
    console.error("Pagefind search error:", error);
    return [];
  });
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
    toggleEmojiSelection,
    setFilteredEmojis,
    setIsSearching,
    setFocusedIndex,
    announceSelection,
    resetSelection,
    selectAllVisible,
  } = useEmojiContext();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [searchPromise, setSearchPromise] = useState<Promise<EmojiMetadata[]> | null>(null);

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
    if (!window.pagefind) {
      setFilteredEmojis(initialEmojis);
      return;
    }
    
    if (searchTerm.trim() === "") {
      const emojis = showSelectedOnly
        ? initialEmojis.filter((emoji) =>
            selectedEmojis.some((selected) => selected.id === emoji.id)
          )
        : initialEmojis;
      setFilteredEmojis(emojis);
      setIsSearching(false);
      setSearchPromise(null);
      return;
    }

    setIsSearching(true);
    const promise = pagefindSearch(searchTerm, initialEmojis, showSelectedOnly, selectedEmojis);
    setSearchPromise(promise);
    
    promise.then((results) => {
      setFilteredEmojis(results);
      setIsSearching(false);
    });
  }, [searchTerm, initialEmojis, showSelectedOnly, selectedEmojis, setFilteredEmojis, setIsSearching]);

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
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <ShowSelectedToggle />
            <GridScaleSlider />
          </div>
        </div>
      </div>

      <section className="w-full">
        {isSearching ? (
          <p className="text-center text-muted-foreground">Searching...</p>
        ) : searchPromise ? (
          <Suspense fallback={<p className="text-center text-muted-foreground">Loading results...</p>}>
            <EmojiGridRenderer
              promise={searchPromise}
              gridScale={gridScale}
              onToggle={handleEmojiSelect}
              onFocusChange={setFocusedIndex}
              onAnnounce={handleAnnounceSelection}
            />
          </Suspense>
        ) : (
          <EmojiGrid
            emojis={filteredEmojis}
            selectedEmojis={selectedEmojis}
            focusedIndex={0}
            gridScale={gridScale}
            onToggleSelection={handleEmojiSelect}
            onSetFocusedIndex={setFocusedIndex}
            onAnnounceSelection={handleAnnounceSelection}
          />
        )}
      </section>

      <div className="container mx-auto p-4">
        <EmojiExport
          selectedEmojis={selectedEmojis}
          onClearSelection={handleResetSelection}
          onSelectAll={() => selectAllVisible(filteredEmojis)}
          filteredEmojis={filteredEmojis}
          gridScale={gridScale}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
};

interface EmojiGridRendererProps {
  promise: Promise<EmojiMetadata[]>;
  gridScale: number;
  onToggle: (emoji: EmojiMetadata) => void;
  onFocusChange: (index: number) => void;
  onAnnounce: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

function EmojiGridRenderer({ promise, gridScale, onToggle, onFocusChange, onAnnounce }: EmojiGridRendererProps) {
  const emojis = use(promise);

  if (emojis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-xl font-medium text-muted-foreground">No emojis found</p>
        <p className="text-sm text-muted-foreground/60">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <EmojiGrid
      emojis={emojis}
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={gridScale}
      onToggleSelection={onToggle}
      onSetFocusedIndex={onFocusChange}
      onAnnounceSelection={onAnnounce}
    />
  );
}

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
