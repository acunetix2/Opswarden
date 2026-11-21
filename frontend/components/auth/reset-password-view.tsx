"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { SupabaseAuthError, takeSessionFromUrl, updatePassword, urlAuthError, usesSupabaseAuth } from "@/lib/supabase-auth";
import { useConfirmPasswordResetMutation } from "@/store/api";
import { useAppDispatch, useSession } from "@/store/hooks";
import { signedIn } from "@/store/session-slice";

import { AuthLayout } from "./auth-layout";
import { PasswordField, passwordProblem } from "./password-field";

export function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const dispatch = useAppDispatch();
  const { status } = useSession();
  const [confirm, { isLoading }] = useConfirmPasswordResetMutation();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // Supabase recovery links arrive with a short-lived session in the URL fragment.
  const [recovery, setRecovery] = useState<{ access: string } | null>(null);
  const [checkedUrl, setCheckedUrl] = useState(!usesSupabaseAuth);

  useEffect(() => {
    if (!usesSupabaseAuth) return;
    const s = takeSessionFromUrl();
    if (s) setRecovery({ access: s.access_token });
    else {
      const linkError = urlAuthError();
      if (linkError) setError(`${linkError}. Request a new link.`);
    }
    setCheckedUrl(true);
  }, []);

  useEffect(() => {
    if (done && status === "authenticated") router.replace("/app/overview");
  }, [done, status, router]);

  const mismatch = repeat.length > 0 && repeat !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError("The passwords don't match.");
    if (usesSupabaseAuth && recovery) {
      setBusy(true);
      try {
        await updatePassword(recovery.access, password);
        setDone(true);
        dispatch(signedIn(recovery.access));
      } catch (err) {
        setError(err instanceof SupabaseAuthError ? err.message : "Couldn't save the password. Request a new link.");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const { access_token } = await confirm({ token, new_password: password }).unwrap();
      setDone(true);
      dispatch(signedIn(access_token));
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  if (!checkedUrl) {
    return <AuthLayout title="Checking your link…">{null}</AuthLayout>;
  }

  if (usesSupabaseAuth ? !recovery : !token) {
    return (
      <AuthLayout title="Reset link missing">
        <Notice tone="danger">{error ?? "This page needs the link from your reset email. Request a new one."}</Notice>
        <ButtonLink href="/forgot-password" className="mt-4 w-full">Request a reset link</ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="You'll be signed in when it's saved."
      footer={<Link href="/login" className="text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <Notice tone="danger" action={/expired|invalid/i.test(error) ? <Link href="/forgot-password" className="text-xs font-medium text-brand-ink underline">New link</Link> : null}>
            {error}
          </Notice>
        ) : null}
        {done ? <Notice tone="success">Password updated. Signing you in…</Notice> : null}
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" checkPolicy />
        <PasswordField
          id="repeat-password"
          label="Repeat new password"
          value={repeat}
          onChange={setRepeat}
          autoComplete="new-password"
          error={mismatch ? "The passwords don't match." : null}
        />
        <Button type="submit" className="w-full" loading={isLoading || busy} disabled={!password || !repeat || done}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
