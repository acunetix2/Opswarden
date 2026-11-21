"use client";

import { useCallback } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import { can, type Permission } from "@/lib/permissions";
import type { Workspace } from "@/lib/types";

import { useMeQuery, useWorkspacesQuery } from "./api";
import type { AppDispatch, AppStore, RootState } from "./index";
import { signedOut, workspaceSelected } from "./session-slice";
import { toastAdded, type ToastTone } from "./ui-slice";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

/** Composes the session slice with the user/workspace queries. */
export function useSession() {
  const dispatch = useAppDispatch();
  const { hydrated, token, workspaceId } = useAppSelector((s) => s.session);
  const skip = !token;
  const me = useMeQuery(undefined, { skip });
  const ws = useWorkspacesQuery(undefined, { skip });

  let status: SessionStatus = "loading";
  if (hydrated && !token) status = "unauthenticated";
  else if (me.data && ws.data) status = "authenticated";
  else if (me.error || ws.error) status = "error";

  const error = me.error ?? ws.error;
  const retry = useCallback(() => {
    void me.refetch();
    void ws.refetch();
  }, [me, ws]);

  const workspaces = ws.data ?? [];
  const workspace: Workspace | null = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null;

  const selectWorkspace = useCallback((id: string) => dispatch(workspaceSelected(id)), [dispatch]);
  const signOut = useCallback(() => dispatch(signedOut()), [dispatch]);

  return { status, error, retry, token, user: me.data ?? null, workspaces, workspace, selectWorkspace, signOut };
}

/** Active workspace plus permission helper. Only valid inside the app shell. */
export function useWorkspace() {
  const { workspace, user } = useSession();
  if (!workspace || !user) throw new Error("useWorkspace requires an authenticated session");
  return {
    workspace,
    user,
    role: workspace.role,
    can: (permission: Permission) => can(workspace.role, permission),
  };
}

export function useToast() {
  const dispatch = useAppDispatch();
  return useCallback(
    (tone: ToastTone, title: string, description?: string) => dispatch(toastAdded({ tone, title, description })),
    [dispatch],
  );
}
