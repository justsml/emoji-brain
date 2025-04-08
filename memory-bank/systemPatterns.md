# System Patterns

This file documents recurring patterns and standards used in the project.

## Search Patterns (Added 2025-04-07)

### Pagefind Integration

*   **Indexing:** A custom script (`scripts/pagefind-builder.ts`) is used to build the Pagefind search index. This script likely processes emoji metadata (e.g., from `src/data/emoji-metadata.json`) to create a searchable index. The index is output to the `public/pagefind/` directory.
*   **Frontend Usage:** The frontend utilizes the Pagefind UI library or its core API to interact with the generated index. Components (like `EmojiGrid.tsx` or a dedicated search component) query the Pagefind index based on user input.
*   **Configuration:** Pagefind might be configured via `astro.config.mjs` or within the build script itself to fine-tune indexing and search behavior (e.g., ranking, filtering).

## State Management Patterns

*(Existing Redux patterns remain, but their application, especially for search state, might have changed due to Pagefind)*

### Redux Store Structure
\`\`\`typescript
interface RootState {
  emoji: EmojiState; // May need review
  ui: UIState;
  search: SearchState; // Review: How much state is now handled by Pagefind vs. Redux?
  export: ExportState;
  selection: SelectionState; // Added selection slice previously
}
\`\`\`

### Slice Pattern
\`\`\`typescript
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
\`\`\`

### Component Usage Pattern
\`\`\`typescript
import { useSelector, useDispatch } from 'react-redux';
import { selectFeature } from './featureSlice'; // Example selector

const Component = () => {
  const dispatch = useDispatch();
  const feature = useSelector(selectFeature); // Example usage
  // component logic
};
\`\`\`

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
* **Pagefind Testing:** Playwright tests (`tests/emoji-explorer.spec.ts`) have been updated to assert search functionality, likely interacting with the Pagefind-powered search UI.

---


## Redux Slice Designs (Review Needed Post-Pagefind)

### Search Slice
*(Review: This slice might be simplified or deprecated if Pagefind handles most search state)*
\`\`\`typescript
interface SearchState {
  query: string; // Still relevant for input binding?
  selectedCategory: string; // Handled by Pagefind filters?
  recentEmojis: EmojiMetadata[]; // Still relevant?
  // Potentially add state related to Pagefind status (loading, error)?
}

const searchSlice = createSlice({
  name: 'search',
  initialState: {
    query: '',
    selectedCategory: 'all', // Default filter?
    recentEmojis: []
  } as SearchState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
    },
    // setSelectedCategory might be removed if Pagefind handles filtering directly
    // updateRecentEmojis might still be relevant
  }
});
\`\`\`

### Selection Slice
*(Likely still relevant)*
\`\`\`typescript
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
\`\`\`

### Local Storage Middleware
*(Likely still relevant for selection)*
\`\`\`typescript
const localStorageMiddleware = createMiddleware((getState) => next => action => {
  const result = next(action);
  if (action.type === 'selection/toggleEmojiSelection' ||
      action.type === 'selection/initializeSelection') {
    const state = getState();
    localStorage.setItem('selectedEmojis', JSON.stringify(state.selection.selectedEmojis));
  }
  return result;
});
\`\`\`
---
*Updates will be logged with timestamps*
[2025-04-03 01:47:50] - Initial creation with Redux patterns documentation
[2025-04-07 22:05:00] - Added Pagefind search pattern, noted Redux search slice for review (approximate time)