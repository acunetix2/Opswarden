"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { usesSupabaseAuth } from "@/lib/supabase-auth";
import type { SignupStart } from "@/lib/types";
import { useSignupResendMutation, useSignupStartMutation, useSignupVerifyMutation } from "@/store/api";
import { useAppDispatch, useSession } from "@/store/hooks";
import { signedIn, workspaceSelected } from "@/store/session-slice";

import { AuthLayout } from "./auth-layout";
import { OtpInput } from "./otp-input";
import { PasswordField, passwordProblem } from "./password-field";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Seconds left until `deadline` (ms timestamp), ticking once a second. */
function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/**
 * Two-step sign-up: details, then the 6-digit code emailed to the address.
 * The account and its workspace are created only after the code is confirmed.
 */
export function SignupView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useSession();
  const [start, startState] = useSignupStartMutation();
  const [resend, resendState] = useSignupResendMutation();
  const [verify, verifyState] = useSignupVerifyMutation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [pending, setPending] = useState<SignupStart | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const resendIn = useCountdown(resendAt);
  const expiresIn = useCountdown(expiresAt);

  useEffect(() => {
    if (status === "authenticated") router.replace("/app/overview");
  }, [status, router]);

  function track(p: SignupStart) {
    setPending(p);
    setResendAt(Date.now() + p.resend_after_seconds * 1000);
    setExpiresAt(Date.now() + p.expires_in_seconds * 1000);
  }

  async function onDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    if (!workspace.trim()) return setError("Name your workspace, for example your company or team.");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (!agreed) return setError("Accept the terms to continue.");
    try {
      const p = await start({ full_name: name.trim(), email: email.trim(), password, workspace_name: workspace.trim() }).unwrap();
      track(p);
      setCode("");
      setInfo(null);
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  const onVerify = useCallback(
    async (value: string) => {
      if (!pending || value.length !== 6 || verifyState.isLoading) return;
      setError(null);
      try {
        const res = await verify({ verification_id: pending.verification_id, code: value }).unwrap();
        setDone(true);
        dispatch(signedIn(res.access_token));
        dispatch(workspaceSelected(res.workspace_id));
      } catch (err) {
        const e = toAppError(err);
        setError(e.message);
        setCode("");
        if (e.code === "CODE_INVALID") setPending(null);
      }
    },
    [pending, verify, verifyState.isLoading, dispatch],
  );

  async function onResend() {
    if (!pending) return;
    setError(null);
    try {
      const p = await resend({ verification_id: pending.verification_id }).unwrap();
      track(p);
      setCode("");
      setInfo(`A new code is on its way to ${maskEmail(p.email)}. The previous one no longer works.`);
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  if (usesSupabaseAuth) {
    return (
      <AuthLayout title="Create your account">
        <Notice tone="info">Accounts on this server are created through an invitation from a workspace admin.</Notice>
        <ButtonLink href="/login" variant="secondary" className="mt-4 w-full">Go to sign in</ButtonLink>
      </AuthLayout>
    );
  }

  // ---- Step 2: code ----------------------------------------------------------------
  if (pending) {
    const expired = expiresAt !== null && expiresIn === 0;
    return (
      <AuthLayout
        title="Check your email"
        description={
          <>
            We sent a 6-digit code to <span className="font-medium text-ink">{pending.email}</span>. Enter it to finish creating your account.
          </>
        }
        footer={
          <p className="text-center text-[13px] text-ink-3">
            Wrong address?{" "}
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setError(null);
                setInfo(null);
              }}
              className="font-medium text-brand-ink hover:underline"
            >
              Change details
            </button>
          </p>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onVerify(code);
          }}
          className="space-y-5"
          noValidate
        >
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-tint text-brand-ink">
            <MailCheck className="size-6" aria-hidden />
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {info && !error ? <Notice tone="success">{info}</Notice> : null}
          {done ? <Notice tone="success">Email confirmed. Setting up your workspace…</Notice> : null}
          {pending.dev_code ? (
            <Notice tone="info" title="Development mode">
              Email isn&apos;t set up on this server, so here is the code: <span className="font-mono font-semibold">{pending.dev_code}</span>
            </Notice>
          ) : null}

          <OtpInput value={code} onChange={setCode} onComplete={(v) => void onVerify(v)} disabled={verifyState.isLoading || done || expired} invalid={Boolean(error)} autoFocus />

          <p className="text-center font-mono text-[12px] text-ink-3" role="status">
            {expired ? "This code has expired. Send a new one." : `Code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`}
          </p>

          <Button type="submit" variant="accent" className="h-10 w-full text-[14px]" loading={verifyState.isLoading} disabled={code.length !== 6 || done || expired}>
            Verify and create account
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-[13px] text-ink-3">
            <span>Didn&apos;t get it? Check spam, or</span>
            <button
              type="button"
              onClick={() => void onResend()}
              disabled={resendIn > 0 || resendState.isLoading || done}
              className="font-medium text-brand-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
            >
              {resendState.isLoading ? "sending…" : resendIn > 0 ? `resend in ${resendIn}s` : "send a new code"}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  // ---- Step 1: details -------------------------------------------------------------
  return (
    <AuthLayout
      title="Create your account"
      description="Start a workspace for your team. We'll email you a code to confirm the address."
      footer={
        <p className="text-center text-[13px] text-ink-3">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-ink hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onDetails} className="space-y-4" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Your name" htmlFor="signup-name">
          <Input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Work email" htmlFor="signup-email">
          <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Workspace name" htmlFor="signup-workspace" hint="Usually your company or team. You can rename it later in Settings.">
          <Input id="signup-workspace" autoComplete="organization" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="e.g. Acme Procurement" />
        </Field>
        <PasswordField id="signup-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" checkPolicy />
        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-snug text-ink-2">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-ink" />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="font-medium text-ink underline-offset-2 hover:underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="font-medium text-ink underline-offset-2 hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <Button
          type="submit"
          variant="accent"
          className="h-10 w-full text-[14px]"
          loading={startState.isLoading}
          disabled={!name || !email || !workspace || !password}
          iconRight={<ArrowLeft className="size-4 rotate-180" aria-hidden />}
        >
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
