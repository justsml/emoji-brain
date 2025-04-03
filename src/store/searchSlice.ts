import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { EmojiMetadata } from '../types/emoji';

interface SearchState {
  query: string;
  selectedCategory: string;
  recentEmojis: EmojiMetadata[];
}

const initialState: SearchState = {
  query: '',
  selectedCategory: 'all',
  recentEmojis: [],
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
    },
    setSelectedCategory: (state, action: PayloadAction<string>) => {
      state.selectedCategory = action.payload;
    },
    // Note: Recent emojis might be better handled via middleware or a dedicated slice
    // if logic becomes complex (e.g., limiting size, persistence).
    // For now, keeping it simple based on the initial design.
    updateRecentEmojis: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.recentEmojis = action.payload;
    },
  },
});

export const { setSearchQuery, setSelectedCategory, updateRecentEmojis } = searchSlice.actions;

// Selectors
export const selectSearchQuery = (state: { search: SearchState }) => state.search.query;
export const selectSelectedCategory = (state: { search: SearchState }) => state.search.selectedCategory;
export const selectRecentEmojis = (state: { search: SearchState }) => state.search.recentEmojis;

export default searchSlice.reducer;