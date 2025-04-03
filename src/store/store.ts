import {
  configureStore,
  createListenerMiddleware,
  combineReducers,
  type TypedStartListening,
  type TypedAddListener,
  type ListenerEffectAPI,
  type UnknownAction,
} from '@reduxjs/toolkit';
import searchReducer from './searchSlice';
import selectionReducer, { selectSelectedEmojis } from './selectionSlice';

// 1. Combine reducers first
const rootReducer = combineReducers({
  search: searchReducer,
  selection: selectionReducer,
});

// 2. Define the store without middleware initially to infer types
const preliminaryStore = configureStore({
  reducer: rootReducer,
});

// 3. Infer RootState and AppDispatch from the preliminary store
export type RootState = ReturnType<typeof preliminaryStore.getState>;
export type AppDispatch = typeof preliminaryStore.dispatch;

// 4. Define Listener Middleware with correct types
const listenerMiddleware = createListenerMiddleware<RootState, AppDispatch>();

// Define typed versions of startListening and addListener
export type AppStartListening = TypedStartListening<RootState, AppDispatch>;
export type AppAddListener = TypedAddListener<RootState, AppDispatch>;

const startAppListening = listenerMiddleware.startListening as AppStartListening;

// Add the listener logic
startAppListening({
  // Listen for actions that modify the selection state
  predicate: (action, currentState, previousState) => {
    // Check if the selectedEmojis array reference has changed
    // This ensures we only save when the actual selection array instance changes
    return currentState.selection.selectedEmojis !== previousState.selection.selectedEmojis;
  },
  effect: async (action: UnknownAction, listenerApi: ListenerEffectAPI<RootState, AppDispatch>) => {
    // Get the updated selection state
    const state = listenerApi.getState(); // No need for 'as RootState' due to typed middleware
    const selectedEmojis = selectSelectedEmojis(state);

    // Persist to localStorage
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedEmojis', JSON.stringify(selectedEmojis));
        // console.log('Persisted selected emojis to localStorage:', selectedEmojis);
      }
    } catch (error) {
      console.error('Failed to persist selected emojis to localStorage:', error);
    }
  },
});

// 5. Configure the final store including the middleware
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

export type AppStore = typeof store;
export type AppState = ReturnType<typeof store.getState>;
export const useAppDispatch = () => store.dispatch; // Custom hook for dispatch

