import React, { type ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import selectionReducer, { type SelectionState } from '../store/selectionSlice';
import type { RootState } from '../store/store';

interface WrapperProps {
  children: React.ReactNode;
}

interface ExtendedRenderOptions {
  initialState?: {
    selection: SelectionState;
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
      }
    },
    store = configureStore({
      reducer: {
        selection: selectionReducer
      },
      preloadedState: initialState
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