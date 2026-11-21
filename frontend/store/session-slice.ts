import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Client session: the bearer token and the active workspace selection.
 * Server data (user, workspaces, cases...) lives in RTK Query, not here.
 */
export interface SessionState {
  /** False until the token has been read from storage on the client. */
  hydrated: boolean;
  token: string | null;
  workspaceId: string | null;
}

const initialState: SessionState = { hydrated: false, token: null, workspaceId: null };

export const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    hydrated(state, action: PayloadAction<{ token: string | null; workspaceId: string | null }>) {
      state.hydrated = true;
      state.token = action.payload.token;
      state.workspaceId = action.payload.workspaceId;
    },
    signedIn(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    /** Same user, new access token (Supabase renewal). Unlike signedIn, cached data is kept. */
    tokenRefreshed(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    signedOut(state) {
      state.token = null;
    },
    workspaceSelected(state, action: PayloadAction<string>) {
      state.workspaceId = action.payload;
    },
  },
});

export const { hydrated, signedIn, signedOut, tokenRefreshed, workspaceSelected } = sessionSlice.actions;
