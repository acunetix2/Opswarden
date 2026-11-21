"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State persisted to localStorage. Starts from `initial` on the server and the
 * first client render, then loads the stored value, so hydration never mismatches.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Corrupt or blocked storage: keep the initial value.
    }
    setLoaded(true);
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage full or disabled: the value still applies for this session.
      }
    },
    [key],
  );

  return [value, set, loaded];
}
