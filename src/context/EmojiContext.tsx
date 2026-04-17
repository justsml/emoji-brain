import React, { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import type { EmojiMetadata } from '../types/emoji';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface EmojiState {
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  filteredEmojis: EmojiMetadata[];
  isSearching: boolean;
  showSelectedOnly: boolean;
  gridScale: number;
}

type EmojiAction =
  | { type: 'TOGGLE_SELECTION'; payload: EmojiMetadata }
  | { type: 'SELECT_ALL'; payload: EmojiMetadata[] }
  | { type: 'RESET_SELECTION' }
  | { type: 'SET_FOCUSED_INDEX'; payload: number }
  | { type: 'SET_FILTERED_EMOJIS'; payload: EmojiMetadata[] }
  | { type: 'SET_IS_SEARCHING'; payload: boolean }
  | { type: 'SET_SHOW_SELECTED_ONLY'; payload: boolean }
  | { type: 'SET_GRID_SCALE'; payload: number };

interface EmojiContextType extends EmojiState {
  toggleEmojiSelection: (emoji: EmojiMetadata) => void;
  selectAllVisible: (emojis: EmojiMetadata[]) => void;
  resetSelection: () => void;
  setFocusedIndex: (index: number) => void;
  setFilteredEmojis: (emojis: EmojiMetadata[]) => void;
  setIsSearching: (searching: boolean) => void;
  setShowSelectedOnly: (show: boolean) => void;
  setGridScale: (scale: number) => void;
  announceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

const initialState: EmojiState = {
  selectedEmojis: [],
  focusedIndex: 0,
  filteredEmojis: [],
  isSearching: false,
  showSelectedOnly: false,
  gridScale: 0,
};

function emojiReducer(state: EmojiState, action: EmojiAction): EmojiState {
  switch (action.type) {
    case 'TOGGLE_SELECTION': {
      const exists = state.selectedEmojis.find(e => e.id === action.payload.id);
      return {
        ...state,
        selectedEmojis: exists
          ? state.selectedEmojis.filter(e => e.id !== action.payload.id)
          : [...state.selectedEmojis, action.payload],
      };
    }
    case 'SELECT_ALL':
      return {
        ...state,
        selectedEmojis: action.payload,
      };
    case 'RESET_SELECTION':
      return {
        ...state,
        selectedEmojis: [],
        focusedIndex: 0,
      };
    case 'SET_FOCUSED_INDEX':
      return {
        ...state,
        focusedIndex: Math.max(0, Math.min(action.payload, state.filteredEmojis.length - 1)),
      };
    case 'SET_FILTERED_EMOJIS':
      return {
        ...state,
        filteredEmojis: action.payload,
      };
    case 'SET_IS_SEARCHING':
      return {
        ...state,
        isSearching: action.payload,
      };
    case 'SET_SHOW_SELECTED_ONLY':
      return {
        ...state,
        showSelectedOnly: action.payload,
      };
    case 'SET_GRID_SCALE':
      return {
        ...state,
        gridScale: action.payload,
      };
    default:
      return state;
  }
}

const EmojiContext = createContext<EmojiContextType | null>(null);

interface EmojiProviderProps {
  children: ReactNode;
  initialEmojis: EmojiMetadata[];
}

export function EmojiProvider({ children, initialEmojis }: EmojiProviderProps) {
  const [storedSelection, setStoredSelection] = useLocalStorage<EmojiMetadata[]>('selectedEmojis', []);
  
  const [state, dispatch] = useReducer(emojiReducer, {
    ...initialState,
    selectedEmojis: storedSelection || [],
    filteredEmojis: initialEmojis,
  });

  useEffect(() => {
    setStoredSelection(state.selectedEmojis);
  }, [state.selectedEmojis, setStoredSelection]);

  const toggleEmojiSelection = useCallback((emoji: EmojiMetadata) => {
    dispatch({ type: 'TOGGLE_SELECTION', payload: emoji });
  }, []);

  const selectAllVisible = useCallback((emojis: EmojiMetadata[]) => {
    dispatch({ type: 'SELECT_ALL', payload: emojis });
  }, []);

  const resetSelection = useCallback(() => {
    dispatch({ type: 'RESET_SELECTION' });
  }, []);

  const setFocusedIndex = useCallback((index: number) => {
    dispatch({ type: 'SET_FOCUSED_INDEX', payload: index });
  }, []);

  const setFilteredEmojis = useCallback((emojis: EmojiMetadata[]) => {
    dispatch({ type: 'SET_FILTERED_EMOJIS', payload: emojis });
  }, []);

  const setIsSearching = useCallback((searching: boolean) => {
    dispatch({ type: 'SET_IS_SEARCHING', payload: searching });
  }, []);

  const setShowSelectedOnly = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_SELECTED_ONLY', payload: show });
  }, []);

  const setGridScale = useCallback((scale: number) => {
    dispatch({ type: 'SET_GRID_SCALE', payload: scale });
  }, []);

  const announceSelection = useCallback((_emoji: EmojiMetadata, _isSelected: boolean) => {
  }, []);

  const value: EmojiContextType = {
    ...state,
    toggleEmojiSelection,
    selectAllVisible,
    resetSelection,
    setFocusedIndex,
    setFilteredEmojis,
    setIsSearching,
    setShowSelectedOnly,
    setGridScale,
    announceSelection,
  };

  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>;
}

export function useEmojiContext(): EmojiContextType {
  const context = useContext(EmojiContext);
  if (!context) {
    throw new Error('useEmojiContext must be used within an EmojiProvider');
  }
  return context;
}
