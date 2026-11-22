"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { SupabaseAuthError, signInWithPassword, takeSessionFromUrl, urlAuthError, usesSupabaseAuth } from "@/lib/supabase-auth";
import { useLoginMutation } from "@/store/api";
import { useAppDispatch, useSession } from "@/store/hooks";
import { signedIn } from "@/store/session-slice";

import { SIGNUP_ENABLED } from "@/components/landing/landing-cta";

import { AuthLayout } from "./auth-layout";

/** Synthetic accounts created by backend/app/seed.py in development. */
const DEMO_ACCOUNTS = [
  { email: "admin@opswarden.app", role: "Admin" },
  { email: "reviewer@opswarden.app", role: "Reviewer" },
  { email: "contributor@opswarden.app", role: "Contributor" },
];
const DEMO_PASSWORD = "Password123!";
// Demo accounts come from the local seed, or backend/scripts/seed_demo_accounts.py on a hosted
// database. They use built-in sign-in, so they're hidden when Supabase Auth is the provider.
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false" && !usesSupabaseAuth;

export function LoginView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useSession();
  const [login, { isLoading: submitting }] = useLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/app/overview");
  }, [status, router]);

  // Supabase email links (e.g. sign-up confirmation) can land here with a session in the URL.
  useEffect(() => {
    if (!usesSupabaseAuth) return;
    const s = takeSessionFromUrl();
    if (s) dispatch(signedIn(s.access_token));
    else {
      const linkError = urlAuthError();
      if (linkError) setError(linkError);
    }
  }, [dispatch]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (usesSupabaseAuth) {
      setBusy(true);
      try {
        const s = await signInWithPassword(email.trim(), password);
        dispatch(signedIn(s.access_token)); // the effect above redirects once the session loads
      } catch (err) {
        setError(err instanceof SupabaseAuthError ? err.message : "Sign-in failed. Try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const { access_token } = await login({ email: email.trim(), password }).unwrap();
      dispatch(signedIn(access_token)); // the effect above redirects once the session loads
    } catch (err) {
      const apiErr = toAppError(err);
      setError(apiErr.status === 422 ? "Enter a valid email address and password." : apiErr.message);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in with your workspace account."
      footer={
        SHOW_DEMO ? (
          <div className="border-t border-line pt-6">
            <p className="text-[13px] text-ink-3">Or look around as a demo user</p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Demo accounts">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  title={a.email}
                  aria-pressed={email === a.email}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  className={
                    "pressable rounded-full border px-3.5 py-1.5 text-[13px] font-medium " +
                    (email === a.email ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink")
                  }
                >
                  {a.role}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              Fills in the form. Password <code className="font-mono text-ink-2">{DEMO_PASSWORD}</code>
            </p>
          </div>
        ) : null
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
          />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label text-ink-2">Password</label>
            <Link href="/forgot-password" className="text-[12px] font-medium text-brand-ink hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
          />
        </div>
        <Button type="submit" variant="accent" className="h-10 w-full text-[14px]" loading={submitting || busy} disabled={!email || !password}>
          Sign in
        </Button>
        {SIGNUP_ENABLED ? (
          <p className="text-center text-[13px] text-ink-3">
            New to OpsWarden?{" "}
            <Link href="/signup" className="font-medium text-brand-ink hover:underline">
              Create an account
            </Link>
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}
