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
  emojis: EmojiMetadata[]; // This will now be the filtered list from the parent
  // searchTerm removed
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void;
}

const STORAGE_KEY = 'selectedEmojis';

const EmojiGrid = ({ emojis, onSelectionChange }: EmojiGridProps): ReactElement => { // Removed searchTerm, renamed initialEmojis to emojis
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  // Removed displayedEmojis state, will use 'emojis' prop directly
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

  // Removed the useEffect hook that performed Pagefind search here.
  // Removed the useEffect hook that performed Pagefind search here.
  // Search is now handled in the parent component (EmojiExplorerApp).

  const handleKeyDown = (e: KeyboardEvent, index: number) => { // Restore function definition
    // Use 'emojis' prop (filtered list) for navigation bounds
    const cols = window.innerWidth >= 1024 ? 9 : window.innerWidth >= 768 ? 6 : 3;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIndex(Math.min(emojis.length - 1, index + 1)); // Use emojis.length
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
        setFocusedIndex(Math.min(emojis.length - 1, index + cols)); // Use emojis.length
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Ensure index is valid for 'emojis' prop before toggling
        if (index >= 0 && index < emojis.length) { // Use emojis.length
          toggleSelection(emojis[index]); // Use emojis prop
        }
        break;
    }
  };

  // useEffect to focus the correct button when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]');
      // Ensure focusedIndex is within bounds of the current emoji list
      if (focusedIndex < buttons.length) {
        buttons[focusedIndex]?.focus();
      } else {
         // If index is out of bounds (e.g., list shrank), reset focus or focus last item?
         // Resetting to -1 might be safer to avoid focusing nothing.
         setFocusedIndex(-1);
      }
    }
  }, [focusedIndex, emojis]); // Depend on 'emojis' prop now

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4"
      role="grid"
      aria-label="Emoji grid"
    >
      {/* Render based on 'emojis' prop */}
      {emojis.map((emoji, index) => (
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
          tabIndex={focusedIndex === index ? 0 : -1}
          role="gridcell"
          aria-label={emoji.filename}
          aria-selected={selectedEmojis.some(e => e.id === emoji.id)}
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
      {/* Message when 'emojis' prop is empty */}
      {/* Removed searchTerm check as it's not available here */}
      {emojis.length === 0 && (
         <p className="col-span-full text-center text-muted-foreground py-8">No emojis found.</p> // Simplified message
      )}
    </div>
  );
};

export default EmojiGrid;