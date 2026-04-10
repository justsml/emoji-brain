import {
  configureStore,
  createListenerMiddleware,
  type TypedStartListening,
  type TypedAddListener,
  type ListenerEffectAPI,
  type UnknownAction,
} from '@reduxjs/toolkit';
import selectionReducer, { selectSelectedEmojis } from './selectionSlice';
import filteredEmojisReducer from './filteredEmojisSlice';

// 1. Define Listener Middleware
export const listenerMiddleware = createListenerMiddleware();

// 2. Configure the store
export const store = configureStore({
  reducer: {
    selection: selectionReducer,
    filteredEmojis: filteredEmojisReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

// 3. Define the types from the final store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
export type AppState = RootState;

// 4. Define typed versions of startListening and addListener
export type AppStartListening = TypedStartListening<RootState, AppDispatch>;
export type AppAddListener = TypedAddListener<RootState, AppDispatch>;
export const useAppDispatch = () => store.dispatch;

// 5. Setup selection persistence listener
const startAppListening = listenerMiddleware.startListening as AppStartListening;

startAppListening({
  predicate: (action, currentState, previousState) => {
    return (
      currentState.selection.selectedEmojis !==
      previousState.selection.selectedEmojis
    );
  },
  effect: async (
    action: UnknownAction,
    listenerApi: ListenerEffectAPI<RootState, AppDispatch>,
  ) => {
    const state = listenerApi.getState();
    const selectedEmojis = selectSelectedEmojis(state);

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedEmojis', JSON.stringify(selectedEmojis));
      }
    } catch (error) {
      console.error(
        'Failed to persist selected emojis to localStorage:',
        error,
      );
    }
  },
});
