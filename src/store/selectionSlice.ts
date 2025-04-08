import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { EmojiMetadata } from '../types/emoji';

export interface SelectionState {
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
}

// Function to load initial state from local storage
const loadInitialSelection = (): EmojiMetadata[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('selectedEmojis');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error reading selected emojis from localStorage:", error);
    return [];
  }
};

const initialState: SelectionState = {
  selectedEmojis: loadInitialSelection(),
  focusedIndex: -1,
};

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    resetSelection: (state) => {
      state.selectedEmojis = [];
      state.focusedIndex = -1;
      // Note: Local storage persistence will be handled by middleware
    },
    toggleEmojiSelection: (state, action: PayloadAction<EmojiMetadata>) => {
      const emoji = action.payload;
      const index = state.selectedEmojis.findIndex(e => e.id === emoji.id);
      if (index === -1) {
        // Add emoji if not selected
        state.selectedEmojis.push(emoji);
      } else {
        // Remove emoji if already selected
        state.selectedEmojis.splice(index, 1);
      }
      // Note: Local storage persistence will be handled by middleware
    },
    setFocusedIndex: (state, action: PayloadAction<number>) => {
      state.focusedIndex = action.payload;
    },
    // Action to explicitly set the selection, e.g., clearing selection
    setSelection: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.selectedEmojis = action.payload;
    },
    // Action to initialize state from local storage (could be used in middleware or effect)
    initializeSelection: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.selectedEmojis = action.payload;
    },
  },
});

export const {
  resetSelection,
  toggleEmojiSelection,
  setFocusedIndex,
  setSelection,
  initializeSelection,
} = selectionSlice.actions;

export const selectSelectedEmojis = (state: { selection: SelectionState }) => state.selection.selectedEmojis;
export const selectFocusedIndex = (state: { selection: SelectionState }) => state.selection.focusedIndex;
export const selectIsEmojiSelected = (emojiId: string) => (state: { selection: SelectionState }) =>
  state.selection.selectedEmojis.some(e => e.id === emojiId);


export default selectionSlice.reducer;