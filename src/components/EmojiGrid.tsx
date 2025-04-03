import React, { useState, useEffect, useRef } from 'react'; // Keep useState for local focus
import type { KeyboardEvent, ReactElement } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { EmojiMetadata } from '../types/emoji';
import { cn } from '../lib/utils';
import {
  toggleEmojiSelection,
  setFocusedIndex as setReduxFocusedIndex, // Rename to avoid conflict
  selectSelectedEmojis,
  selectFocusedIndex as selectReduxFocusedIndex, // Use if needed to sync from Redux
} from '../store/selectionSlice';
import type { AppDispatch } from '../store/store';

interface EmojiGridProps {
  emojis: EmojiMetadata[]; // Emojis are now passed directly based on filtering in parent
  // Removed onSelectionChange
}

// Removed STORAGE_KEY

const EmojiGrid: React.FC<EmojiGridProps> = ({ emojis }): ReactElement => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedEmojis = useSelector(selectSelectedEmojis); // Get selection from Redux
  // Keep local focus state for direct component control and performance
  const [localFocusedIndex, setLocalFocusedIndex] = useState<number>(-1);
  // const reduxFocusedIndex = useSelector(selectReduxFocusedIndex); // Optionally sync if needed elsewhere

  const gridRef = useRef<HTMLDivElement>(null);

  // Reset focus when the list of emojis changes (e.g., due to filtering)
  useEffect(() => {
    setLocalFocusedIndex(-1);
    // dispatch(setReduxFocusedIndex(-1)); // Also reset in Redux if necessary
  }, [emojis]);

  // Removed useEffect for initializing selectedEmojis from localStorage
  // Removed useEffect for 'updateEmojis' event listener

  const handleToggleSelection = (emoji: EmojiMetadata) => {
    dispatch(toggleEmojiSelection(emoji));
  };

  const updateFocus = (newIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(emojis.length - 1, newIndex));
    if (clampedIndex !== localFocusedIndex) {
      setLocalFocusedIndex(clampedIndex);
      // Dispatch to keep Redux state in sync if needed by other components
      // dispatch(setReduxFocusedIndex(clampedIndex));
    }
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (!gridRef.current) return;
    // Calculate columns based on current grid layout (could be improved with ResizeObserver)
    const gridStyle = window.getComputedStyle(gridRef.current);
    const gridTemplateColumns = gridStyle.getPropertyValue('grid-template-columns');
    const cols = gridTemplateColumns.split(' ').length;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        updateFocus(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        updateFocus(index - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        updateFocus(index - cols);
        break;
      case 'ArrowDown':
        e.preventDefault();
        updateFocus(index + cols);
        break;
      case 'Enter':
      case ' ': // Space key
        e.preventDefault();
        if (index >= 0 && index < emojis.length) {
          handleToggleSelection(emojis[index]);
        }
        break;
      case 'Home':
         e.preventDefault();
         updateFocus(0);
         break;
      case 'End':
         e.preventDefault();
         updateFocus(emojis.length - 1);
         break;
    }
  };

  // Effect to focus the actual DOM element when localFocusedIndex changes
  useEffect(() => {
    if (localFocusedIndex >= 0 && gridRef.current) {
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button[role="gridcell"]');
      buttons[localFocusedIndex]?.focus();
    }
  }, [localFocusedIndex]); // Depend only on local state for focus

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4"
      role="grid"
      aria-label="Emoji grid"
      // Add aria-activedescendant logic if needed for better screen reader support
    >
      {emojis.map((emoji, index) => {
        const isSelected = selectedEmojis.some(e => e.id === emoji.id); // Check selection from Redux
        return (
          <button
            key={emoji.id}
            className={cn(
              'aspect-square rounded-lg border bg-card text-card-foreground relative group',
              'shadow-sm flex items-center justify-center',
              'transition-all duration-200 ease-in-out',
              'hover:scale-105 hover:shadow-md focus:scale-105 focus:shadow-md',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              isSelected && 'ring-2 ring-primary ring-offset-2 bg-primary/10' // Use isSelected from Redux
            )}
            onClick={() => handleToggleSelection(emoji)} // Dispatch Redux action
            onKeyDown={(e) => handleKeyDown(e, index)}
            // Manage tabIndex based on local focus state for keyboard nav
            tabIndex={localFocusedIndex === -1 && index === 0 ? 0 : (localFocusedIndex === index ? 0 : -1)}
            role="gridcell"
            aria-selected={isSelected}
            aria-label={emoji.filename}
            id={`emoji-${emoji.id}`} // Add ID for potential aria-activedescendant
          >
            <img
              src={emoji.path.startsWith('/') ? emoji.path : `/${emoji.path}`}
              alt="" // Alt text is redundant with aria-label
              className="w-12 h-12 object-contain pointer-events-none" // Prevent image drag/interaction
              loading="lazy"
              onError={(e) => {
                console.error(`Failed to load image: ${emoji.path}`);
                e.currentTarget.src = '/favicon.svg'; // Fallback image
              }}
            />
            <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-sm p-2 text-center pointer-events-none">
              {emoji.filename}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default EmojiGrid;