"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PillTabs } from "@/components/ui/pill-tabs";
import { toAppError } from "@/lib/api-error";
import { SupabaseAuthError, signInWithPassword, signUp, takeSessionFromUrl, urlAuthError } from "@/lib/supabase-auth";
import type { InvitationLookup } from "@/lib/types";
import { useClaimInvitationMutation, useMeQuery } from "@/store/api";
import { useAppDispatch, useSession } from "@/store/hooks";
import { signedIn, signedOut, workspaceSelected } from "@/store/session-slice";

import { PasswordField, passwordProblem } from "./password-field";

/**
 * Invitation acceptance with Supabase Auth: create (or sign in to) a Supabase
 * account for the invited email, then claim the invitation. The backend only
 * grants access when the signed-in email matches the invitation.
 */
export function SupabaseInvite({ token, inv }: { token: string; inv: InvitationLookup }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useSession();
  const me = useMeQuery(undefined, { skip: status !== "authenticated" });
  const [claim, claimState] = useClaimInvitationMutation();
  const [mode, setMode] = useState<"create" | "signin">(inv.account_exists ? "signin" : "create");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const claimed = useRef(false);

  // Returning from the confirmation email: the session is in the URL fragment.
  useEffect(() => {
    const s = takeSessionFromUrl();
    if (s) dispatch(signedIn(s.access_token));
    else {
      const linkError = urlAuthError();
      if (linkError) setError(linkError);
    }
  }, [dispatch]);

  // Once signed in as the invited email, redeem the invitation automatically.
  const email = me.data?.email?.toLowerCase();
  const matches = email === inv.email.toLowerCase();
  useEffect(() => {
    if (!matches || claimed.current) return;
    claimed.current = true;
    claim(token)
      .unwrap()
      .then((res) => {
        dispatch(workspaceSelected(res.workspace_id));
        router.replace("/app/overview");
      })
      .catch((err) => {
        claimed.current = false;
        setError(toAppError(err).message);
      });
  }, [matches, claim, token, dispatch, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "create") {
      if (!name.trim()) return setError("Enter your name.");
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
    }
    setBusy(true);
    try {
      if (mode === "create") {
        const session = await signUp(inv.email, password, name.trim(), window.location.href);
        if (session) dispatch(signedIn(session.access_token));
        else setCheckEmail(true);
      } else {
        const session = await signInWithPassword(inv.email, password);
        dispatch(signedIn(session.access_token));
      }
    } catch (err) {
      setError(err instanceof SupabaseAuthError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "authenticated" && email && !matches) {
    return (
      <div className="space-y-4">
        <Notice tone="warning">
          You&apos;re signed in as {email}, but this invitation is for {inv.email}. Sign out, then open the invitation link again.
        </Notice>
        <Button variant="secondary" className="w-full" onClick={() => dispatch(signedOut())}>
          Sign out
        </Button>
      </div>
    );
  }

  if (status === "authenticated" && matches) {
    return error ? <Notice tone="danger">{error}</Notice> : <Notice tone="success">Joining {inv.workspace_name}…</Notice>;
  }

  if (checkEmail) {
    return (
      <Notice tone="info" title="Confirm your email">
        We sent a confirmation link to {inv.email}. Open it on this device; it brings you back here and finishes joining the workspace.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <PillTabs
        label="Account"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        tabs={[
          { value: "create", label: "Create account" },
          { value: "signin", label: "I have an account" },
        ]}
      />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Email" htmlFor="invite-email" hint="Invitations are tied to this address.">
          <Input id="invite-email" value={inv.email} readOnly disabled />
        </Field>
        {mode === "create" ? (
          <Field label="Your name" htmlFor="invite-name">
            <Input id="invite-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        ) : null}
        <PasswordField
          id="invite-password"
          label={mode === "create" ? "Choose a password" : "Your password"}
          value={password}
          onChange={setPassword}
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          checkPolicy={mode === "create"}
        />
        <Button type="submit" variant="accent" className="h-10 w-full" loading={busy || claimState.isLoading} disabled={!password}>
          {mode === "create" ? "Create account and join" : "Sign in and join"}
        </Button>
      </form>
    </div>
  );
}
