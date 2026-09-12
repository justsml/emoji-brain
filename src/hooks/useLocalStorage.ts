import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });
  const pending = useRef<{key: string; value: T} | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const flush = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    const write = pending.current;
    if (!write) return;
    pending.current = null;
    try {
      // Serialization belongs in the idle task too, never in a React updater.
      window.localStorage.setItem(write.key, JSON.stringify(write.value));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded');
      } else {
        console.warn(`Error setting localStorage key "${write.key}":`, error);
      }
    }
  }, []);

  // Record committed state before a navigation can fire pagehide. Only the
  // pending snapshot and timer are updated here; serialization stays deferred.
  useLayoutEffect(() => {
    if (pending.current && pending.current.key !== key) flush();
    pending.current = {key, value: storedValue};
    // Coalesce rapid changes. The timeout bounds persistence delay on a busy
    // page; browsers without idle callbacks still yield the input task first.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(flush, {timeout: 1000});
      cancel.current = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(flush, 250);
      cancel.current = () => window.clearTimeout(id);
    }
    return () => { cancel.current?.(); cancel.current = null; };
  }, [key, storedValue, flush]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      // Navigation/unmount must not drop a selection made just before leaving.
      flush();
    };
  }, [flush]);

  return [storedValue, setStoredValue];
}
