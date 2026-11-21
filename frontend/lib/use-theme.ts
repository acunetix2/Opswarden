"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ow-theme";
const EVENT = "ow:theme";

/**
 * Light/dark theme shared by every toggle in the app. The inline script in
 * app/layout.tsx applies the saved choice before first paint; toggles stay in
 * sync through a window event.
 */
export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);

  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme !== "dark";
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // Storage disabled: the theme still applies until reload.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { dark, toggle };
}
