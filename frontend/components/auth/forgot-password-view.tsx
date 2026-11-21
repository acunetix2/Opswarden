"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { requestPasswordRecovery, SupabaseAuthError, usesSupabaseAuth } from "@/lib/supabase-auth";
import { useRequestPasswordResetMutation } from "@/store/api";

import { AuthLayout } from "./auth-layout";

export function ForgotPasswordView() {
  const [request, { isLoading }] = useRequestPasswordResetMutation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; dev_reset_url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (usesSupabaseAuth) {
      setBusy(true);
      try {
        await requestPasswordRecovery(email.trim(), `${window.location.origin}/reset-password`);
        setResult({ message: "If an account exists for that email, a reset link is on its way.", dev_reset_url: null });
      } catch (err) {
        setError(err instanceof SupabaseAuthError ? err.message : "Couldn't send the reset link. Try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      setResult(await request({ email: email.trim() }).unwrap());
    } catch (err) {
      const apiErr = toAppError(err);
      setError(apiErr.status === 422 ? "Enter a valid email address." : apiErr.message);
    }
  }

  const back = (
    <Link href="/login" className="text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">
      ← Back to sign in
    </Link>
  );

  if (result) {
    return (
      <AuthLayout title="Check your inbox." footer={back}>
        <div className="space-y-5">
          <p className="text-[14px] leading-relaxed text-ink-2" role="status">
            {result.message} The link works once.
            {usesSupabaseAuth ? null : " It expires in 30 minutes. Your workspace admin can also issue a reset link from Team & access."}
          </p>
          {result.dev_reset_url ? (
            <Notice tone="warning" title="Development mode">
              Email isn&apos;t needed locally, so here&apos;s the link. Production builds never show it.{" "}
              <Link href={result.dev_reset_url.replace(/^https?:\/\/[^/]+/, "")} className="font-medium text-brand-ink underline">
                Open reset link →
              </Link>
            </Notice>
          ) : null}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password" description="Enter your account email. We'll send a one-time reset link." footer={back}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Email" htmlFor="reset-email">
          <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Button type="submit" className="w-full" loading={isLoading || busy} disabled={!email.trim()}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
