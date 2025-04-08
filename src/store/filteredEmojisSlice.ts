import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { EmojiMetadata } from '../types/emoji';

interface FilteredEmojisState {
  emojis: EmojiMetadata[];
  isSearching: boolean;
}

const initialState: FilteredEmojisState = {
  emojis: [],
  isSearching: false,
};

export const filteredEmojisSlice = createSlice({
  name: 'filteredEmojis',
  initialState,
  reducers: {
    setFilteredEmojis: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.emojis = action.payload;
    },
    setIsSearching: (state, action: PayloadAction<boolean>) => {
      state.isSearching = action.payload;
    },
  },
});

export const { setFilteredEmojis, setIsSearching } = filteredEmojisSlice.actions;

export const selectFilteredEmojis = (state: RootState) => state.filteredEmojis.emojis;
export const selectIsSearching = (state: RootState) => state.filteredEmojis.isSearching;

export default filteredEmojisSlice.reducer;