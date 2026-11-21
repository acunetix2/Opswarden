import { combineReducers, configureStore, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { opswardenApi } from "./api";
import { draftsSlice } from "./drafts-slice";
import { signOutRemote, usesSupabaseAuth } from "@/lib/supabase-auth";

import { sessionSlice, signedIn, signedOut, tokenRefreshed, workspaceSelected } from "./session-slice";
import { uiSlice } from "./ui-slice";

export const TOKEN_KEY = "opswarden.token";
export const WORKSPACE_KEY = "opswarden.workspace";

const rootReducer = combineReducers({
  session: sessionSlice.reducer,
  ui: uiSlice.reducer,
  drafts: draftsSlice.reducer,
  [opswardenApi.reducerPath]: opswardenApi.reducer,
});

type CombinedState = ReturnType<typeof rootReducer>;
export type RootState = CombinedState;

/** Clears tenant-scoped client state (drafts) on sign-out or workspace switch. */
function rootReducerWithReset(state: CombinedState | undefined, action: { type: string }): CombinedState {
  if (state && (signedOut.match(action) || workspaceSelected.match(action))) {
    return rootReducer({ ...state, drafts: {} }, action);
  }
  return rootReducer(state, action);
}

/**
 * Side effects of session changes:
 *  - persist the token / workspace choice to localStorage
 *  - drop all cached server data on sign-out or workspace switch, so nothing
 *    from one tenant can be rendered under another
 *
 * localStorage keeps the MVP simple; production should use an httpOnly cookie.
 */
function sessionListener() {
  const listener = createListenerMiddleware();
  listener.startListening({
    matcher: isAnyOf(signedIn, signedOut, tokenRefreshed, workspaceSelected),
    effect(action, api) {
      const { session } = api.getState() as RootState;
      if (signedOut.match(action) && usesSupabaseAuth) {
        // Revoke the Supabase refresh token too, not just the local copy.
        const previous = (api.getOriginalState() as RootState).session.token;
        void signOutRemote(previous);
      }
      if (session.token) window.localStorage.setItem(TOKEN_KEY, session.token);
      else window.localStorage.removeItem(TOKEN_KEY);
      if (session.workspaceId) window.localStorage.setItem(WORKSPACE_KEY, session.workspaceId);

      if (signedOut.match(action) || signedIn.match(action) || workspaceSelected.match(action)) {
        api.dispatch(opswardenApi.util.resetApiState());
      }
    },
  });
  return listener.middleware;
}

export function makeStore() {
  return configureStore({
    reducer: rootReducerWithReset,
    middleware: (getDefault) => getDefault().prepend(sessionListener()).concat(opswardenApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
