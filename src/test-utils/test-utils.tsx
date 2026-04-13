import React, { type ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import selectionReducer, { type SelectionState } from '../store/selectionSlice';
import filteredEmojisReducer from '../store/filteredEmojisSlice';
import type { RootState } from '../store/store';

interface WrapperProps {
  children: React.ReactNode;
}

interface ExtendedRenderOptions {
  initialState?: {
    selection?: SelectionState;
    filteredEmojis?: {
      emojis: any[];
      isSearching: boolean;
      showSelectedOnly: boolean;
      gridScale: number;
    };
  };
  store?: ReturnType<typeof configureStore>;
}

function render(
  ui: ReactElement,
  {
    initialState = {
      selection: {
        selectedEmojis: [],
        focusedIndex: -1
      },
      filteredEmojis: {
        emojis: [],
        isSearching: false,
        showSelectedOnly: false,
        gridScale: 4
      }
    },
    store = configureStore({
      reducer: {
        selection: selectionReducer,
        filteredEmojis: filteredEmojisReducer
      },
      preloadedState: initialState as any
    }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return <Provider store={store}>{children}</Provider>;
  }

  return {
    store,
    ...rtlRender(ui, {
      wrapper: Wrapper,
      ...renderOptions,
    }),
  };
}

// re-export everything
export * from '@testing-library/react';
export { render };