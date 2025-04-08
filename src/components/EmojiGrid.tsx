import type { ReactElement } from 'react';
import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { EmojiMetadata } from '../types/emoji';
import { cn } from '../lib/utils';

// Define Pagefind types for better integration
declare global {
  interface Window {
    _pagefind?: {
      search: (term: string) => Promise<{ results: PagefindResult[] }>;
      options: (opts: Record<string, any>) => Promise<void>;
    };
  }
  interface PagefindResult {
    id: string;
    score: number;
    words: number[];
    data: () => Promise<PagefindFragmentData>;
  }
  interface PagefindFragmentData {
    url: string;
    raw_url: string;
    content: string;
    excerpt: string;
    word_count: number;
    meta?: Record<string, string>; // Expecting id, filename, path here
    filters?: Record<string, string[]>;
  }
}

interface EmojiGridProps {
  emojis: EmojiMetadata[]; // This is the full list of all emojis
  searchTerm: string; // Current search term from the parent
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void;
}

const STORAGE_KEY = 'selectedEmojis';

const EmojiGrid = ({ emojis: initialEmojis, searchTerm, onSelectionChange }: EmojiGridProps): ReactElement => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [displayedEmojis, setDisplayedEmojis] = useState<EmojiMetadata[]>(initialEmojis); // Emojis currently shown (filtered or all)
  const [selectedEmojis, setSelectedEmojis] = useState<EmojiMetadata[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const gridRef = useRef<HTMLDivElement>(null);

  const toggleSelection = (emoji: EmojiMetadata) => {
    setSelectedEmojis(prevSelectedEmojis => {
      const isSelected = prevSelectedEmojis.some(e => e.id === emoji.id);
      const newSelection = isSelected
        ? prevSelectedEmojis.filter(e => e.id !== emoji.id)
        : [...prevSelectedEmojis, emoji];

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection));
      onSelectionChange?.(newSelection);
      return newSelection;
    });
  };

  // useEffect to handle searching with Pagefind API
  useEffect(() => {
    const performSearch = async () => {
      // If search term is empty, show all emojis
      if (!searchTerm) {
        setDisplayedEmojis(initialEmojis);
        setFocusedIndex(-1);
        return;
      }

      // Ensure pagefind is loaded
      if (window.pagefind) {
        try {
          const searchResults = await window.pagefind.search(searchTerm);
          const emojiDataPromises = searchResults.results.map(result => result.data());
          const fragments = await Promise.all(emojiDataPromises);

          // Map Pagefind results back to EmojiMetadata
          // Assumes metadata (id, filename, path) is stored in the index
          const filteredEmojis = fragments
            .map(fragment => {
              // Check if essential metadata exists
              if (fragment.meta?.id && fragment.meta?.filename && fragment.meta?.path) {
                // Find the original full EmojiMetadata object to preserve any other potential fields
                const originalEmoji = initialEmojis.find(e => e.id === fragment.meta!.id);
                return originalEmoji || null; // Return the full object if found
              }
              console.warn(`Missing metadata for Pagefind result: ${fragment.url}`);
              return null;
            })
            .filter((emoji): emoji is EmojiMetadata => emoji !== null); // Filter out nulls or incomplete results

          setDisplayedEmojis(filteredEmojis);
          setFocusedIndex(-1); // Reset focus on new results
        } catch (e) {
          console.error("Pagefind search failed:", e);
          setDisplayedEmojis([]); // Show empty on error? Or initialEmojis? Let's go with empty for clarity.
          setFocusedIndex(-1);
        }
      } else {
        console.warn("Pagefind not available yet. Cannot search.");
        // Fallback if pagefind isn't ready - show initial list? Or empty?
        // Showing initial might be confusing if user typed something. Let's show empty.
        setDisplayedEmojis([]);
        setFocusedIndex(-1);
      }
    };

    // Debounce search slightly? For now, run directly.
    performSearch();

  }, [searchTerm, initialEmojis]); // Rerun on search term or initial list change

  // Removed the old useEffect for 'updateEmojis' event listener

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    // Use displayedEmojis for navigation bounds
    const cols = window.innerWidth >= 1024 ? 9 : window.innerWidth >= 768 ? 6 : 3;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIndex(Math.min(displayedEmojis.length - 1, index + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedIndex(Math.max(0, index - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(Math.max(0, index - cols));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(Math.min(displayedEmojis.length - 1, index + cols));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Ensure index is valid for displayedEmojis before toggling
        if (index >= 0 && index < displayedEmojis.length) {
          toggleSelection(displayedEmojis[index]);
        }
        break;
    }
  };

  // useEffect to focus the correct button when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]');
      buttons[focusedIndex]?.focus();
    }
  }, [focusedIndex, displayedEmojis]); // Also depend on displayedEmojis in case the list shrinks

  return (
    // Add the id for Pagefind UI results container if we were using that approach.
    // Since we're using the API, this div just holds our grid.
    <div
      ref={gridRef}
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4"
      role="grid"
      aria-label="Emoji grid"
    >
      {/* Render based on displayedEmojis state */}
      {displayedEmojis.map((emoji, index) => (
        <button
          key={emoji.id}
          className={cn(
            "aspect-square rounded-lg border bg-card text-card-foreground relative group",
            "shadow-sm flex items-center justify-center",
            "transition-all duration-200 ease-in-out",
            "hover:scale-105 hover:shadow-md focus:scale-105 focus:shadow-md",
            "focus:outline-none focus:ring-2 focus:ring-primary",
            selectedEmojis.some(e => e.id === emoji.id) &&
              "ring-2 ring-primary ring-offset-2 bg-primary/10"
          )}
          onClick={() => toggleSelection(emoji)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          tabIndex={focusedIndex === index ? 0 : -1} // Manage focus based on index
          role="gridcell"
          aria-label={emoji.filename}
          aria-selected={selectedEmojis.some(e => e.id === emoji.id)} // Add aria-selected
        >
          <img
            src={emoji.path}
            alt={emoji.filename}
            className="w-12 h-12 object-contain"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-sm p-2 text-center">
            {emoji.filename}
          </div>
        </button>
      ))}
      {/* Optionally, add a message when displayedEmojis is empty after a search */}
      {searchTerm && displayedEmojis.length === 0 && (
         <p className="col-span-full text-center text-muted-foreground py-8">No emojis found for "{searchTerm}".</p>
      )}
    </div>
  );
};

export default EmojiGrid;