"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Provider } from "react-redux";

import { makeStore, TOKEN_KEY, WORKSPACE_KEY, type AppStore } from "./index";
import { hydrated } from "./session-slice";

/**
 * One store per browser session. The token is read from storage after mount
 * so server and client render the same initial markup.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();

  useEffect(() => {
    storeRef.current?.dispatch(
      hydrated({
        token: window.localStorage.getItem(TOKEN_KEY),
        workspaceId: window.localStorage.getItem(WORKSPACE_KEY),
      }),
    );
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
