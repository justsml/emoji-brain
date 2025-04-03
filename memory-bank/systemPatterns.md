# System Patterns

This file documents recurring patterns and standards used in the project.

2025-04-03 01:47:50 - Initial creation with Redux patterns

## State Management Patterns

### Redux Store Structure
```typescript
interface RootState {
  emoji: EmojiState;
  ui: UIState;
  search: SearchState;
  export: ExportState;
}
```

### Slice Pattern
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export const featureSlice = createSlice({
  name: 'feature',
  initialState,
  reducers: {
    action: (state, action: PayloadAction<PayloadType>) => {
      // state mutations here
    }
  }
});
```

### Component Usage Pattern
```typescript
import { useSelector, useDispatch } from 'react-redux';
import { selectFeature } from './featureSlice';

const Component = () => {
  const dispatch = useDispatch();
  const feature = useSelector(selectFeature);
  // component logic
};
```

## Architectural Patterns

* Feature-based directory structure
* Centralized store configuration
* Typed selectors and actions
* Memoized selectors for performance
* Action creator utilities

## Testing Patterns

* Unit tests for reducers
* Integration tests for connected components
* Mock store for component testing
* Action creator testing
* Selector testing

---


## Redux Slice Designs (Added 2025-04-03 01:50:40)

### Search Slice
```typescript
interface SearchState {
  query: string;
  selectedCategory: string;
  recentEmojis: EmojiMetadata[];
}

const searchSlice = createSlice({
  name: 'search',
  initialState: {
    query: '',
    selectedCategory: 'all',
    recentEmojis: []
  } as SearchState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
    },
    setSelectedCategory: (state, action: PayloadAction<string>) => {
      state.selectedCategory = action.payload;
    },
    updateRecentEmojis: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.recentEmojis = action.payload;
    }
  }
});
```

### Selection Slice
```typescript
interface SelectionState {
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
}

const selectionSlice = createSlice({
  name: 'selection',
  initialState: {
    selectedEmojis: [],
    focusedIndex: -1
  } as SelectionState,
  reducers: {
    toggleEmojiSelection: (state, action: PayloadAction<EmojiMetadata>) => {
      const emoji = action.payload;
      const index = state.selectedEmojis.findIndex(e => e.id === emoji.id);
      if (index === -1) {
        state.selectedEmojis.push(emoji);
      } else {
        state.selectedEmojis.splice(index, 1);
      }
      // Local storage handled in middleware
    },
    setFocusedIndex: (state, action: PayloadAction<number>) => {
      state.focusedIndex = action.payload;
    },
    initializeSelection: (state, action: PayloadAction<EmojiMetadata[]>) => {
      state.selectedEmojis = action.payload;
    }
  }
});
```

### Local Storage Middleware
```typescript
const localStorageMiddleware = createMiddleware((getState) => next => action => {
  const result = next(action);
  if (action.type === 'selection/toggleEmojiSelection' || 
      action.type === 'selection/initializeSelection') {
    const state = getState();
    localStorage.setItem('selectedEmojis', JSON.stringify(state.selection.selectedEmojis));
  }
  return result;
});
```
*Updates will be logged with timestamps*
[2025-04-03 01:47:50] - Initial creation with Redux patterns documentation