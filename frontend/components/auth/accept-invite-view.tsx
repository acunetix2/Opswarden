"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { useAcceptInvitationMutation, useLookupInvitationQuery } from "@/store/api";
import { useAppDispatch, useSession } from "@/store/hooks";
import { signedIn, workspaceSelected } from "@/store/session-slice";

import { usesSupabaseAuth } from "@/lib/supabase-auth";

import { AuthLayout } from "./auth-layout";
import { PasswordField, passwordProblem } from "./password-field";
import { SupabaseInvite } from "./supabase-invite";

export function AcceptInviteView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const dispatch = useAppDispatch();
  const { status } = useSession();
  const lookup = useLookupInvitationQuery(token, { skip: !token });
  const [accept, { isLoading }] = useAcceptInvitationMutation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (joined && status === "authenticated") router.replace("/app/overview");
  }, [joined, status, router]);

  const inv = lookup.data;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inv) return;
    setError(null);
    if (!inv.account_exists) {
      if (!name.trim()) return setError("Enter your name.");
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
    }
    try {
      const res = await accept({ token, password, full_name: inv.account_exists ? undefined : name.trim() }).unwrap();
      setJoined(true);
      dispatch(signedIn(res.access_token));
      dispatch(workspaceSelected(res.workspace_id));
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  if (!token || lookup.error) {
    return (
      <AuthLayout title="Invitation unavailable">
        <Notice tone="danger">
          {lookup.error ? toAppError(lookup.error).message : "This page needs the link from your invitation."} Ask the
          person who invited you to send a new one.
        </Notice>
        <ButtonLink href="/login" variant="secondary" className="mt-4 w-full">Go to sign in</ButtonLink>
      </AuthLayout>
    );
  }

  if (!inv) {
    return (
      <AuthLayout title="Loading invitation…">
        <Skeleton className="h-40 w-full" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${inv.workspace_name}`}
      description={inv.account_exists ? "Sign in with your existing OpsWarden password to accept." : "Create your account to accept the invitation."}
    >
      <dl className="mb-6 divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-canvas/50 px-3 text-[13px]">
        {[
          ["Invited", <span key="e" className="font-mono text-[12.5px]">{inv.email}</span>],
          ["Role", ROLE_DESCRIPTIONS[inv.role].label],
          ["From", inv.invited_by_name ?? "A workspace admin"],
          ["Expires", <span key="x" className="font-mono text-[12.5px]">{formatDate(inv.expires_at)}</span>],
        ].map(([k, v]) => (
          <div key={String(k)} className="grid grid-cols-[5.5rem_1fr] py-2">
            <dt className="label pt-0.5">{k}</dt>
            <dd className="truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {usesSupabaseAuth ? (
        <SupabaseInvite token={token} inv={inv} />
      ) : (
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {joined ? <Notice tone="success">You&apos;re in. Opening the workspace…</Notice> : null}
        {!inv.account_exists ? (
          <Field label="Your name" htmlFor="invite-name">
            <Input id="invite-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        ) : null}
        <PasswordField
          id="invite-password"
          label={inv.account_exists ? "Your password" : "Choose a password"}
          value={password}
          onChange={setPassword}
          autoComplete={inv.account_exists ? "current-password" : "new-password"}
          checkPolicy={!inv.account_exists}
        />
        <Button type="submit" className="w-full" loading={isLoading} disabled={!password || joined}>
          Accept invitation
        </Button>
      </form>
      )}
    </AuthLayout>
  );
}
