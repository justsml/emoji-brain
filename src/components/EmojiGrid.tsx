import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { EmojiMetadata } from '../types/emoji';
import { cn } from '../lib/utils';
import { useDispatch, useSelector } from 'react-redux';
import { toggleEmojiSelection, setFocusedIndex, selectSelectedEmojis, selectFocusedIndex } from '../store/selectionSlice';

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void;
}

const EmojiGrid = ({ emojis, onSelectionChange }: EmojiGridProps): ReactElement => {
  const dispatch = useDispatch();
  const selectedEmojis = useSelector(selectSelectedEmojis);
  const focusedIndex = useSelector(selectFocusedIndex);
  const gridRef = useRef<HTMLDivElement>(null);

  const toggleSelection = (emoji: EmojiMetadata) => {
    dispatch(toggleEmojiSelection(emoji));
    onSelectionChange?.(selectedEmojis);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const cols = window.innerWidth >= 1024 ? 9 : window.innerWidth >= 768 ? 6 : 3;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        dispatch(setFocusedIndex(Math.min(emojis.length - 1, index + 1)));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        dispatch(setFocusedIndex(Math.max(0, index - 1)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        dispatch(setFocusedIndex(Math.max(0, index - cols)));
        break;
      case 'ArrowDown':
        e.preventDefault();
        dispatch(setFocusedIndex(Math.min(emojis.length - 1, index + cols)));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (index >= 0 && index < emojis.length) {
          toggleSelection(emojis[index]);
        }
        break;
    }
  };

  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]');
      if (focusedIndex < buttons.length) {
        buttons[focusedIndex]?.focus();
      } else {
        dispatch(setFocusedIndex(-1));
      }
    }
  }, [focusedIndex, emojis, dispatch]);

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-6"
      role="grid"
      aria-label="Emoji grid"
    >
      {emojis.map((emoji, index) => (
        <button
          key={emoji.id}
          className={cn(
            "aspect-square rounded-lg border bg-card text-card-foreground relative group",
            "shadow-sm flex items-center justify-center",
            "transition-all duration-200 ease-in-out",
            "hover:scale-110 hover:shadow-md focus:scale-105 focus:shadow-md hover:bg-primary/10",
            "focus:outline-none focus:ring-1 focus:ring-primary focus:bg-primary/10",
            selectedEmojis.some(e => e.id === emoji.id) &&
              "ring-primary bg-primary/10"
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
          <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-xs p-2 text-center font-mono">
            :{emoji.filename?.split('.')[0]}:
          </div>
        </button>
      ))}
      {emojis.length === 0 && (
        <p className="col-span-full text-center text-muted-foreground py-8">No emojis found.</p>
      )}
    </div>
  );
};

export default EmojiGrid;