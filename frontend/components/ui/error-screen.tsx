"use client";

import { Home, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { LogoMark } from "@/components/layout/logo";

import { Button, ButtonLink } from "./button";

interface ErrorScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Inside the app shell it sits in the page; at the root it fills the screen. */
  inline?: boolean;
}

/** Branded fallback for unexpected render errors. Never shows stack traces. */
export function ErrorScreen({ error, reset, inline }: ErrorScreenProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={inline ? "grid place-items-center py-12" : "grid min-h-screen place-items-center bg-canvas px-6"}>
      <BrandedMessage
        eyebrow="Unexpected error"
        title="Something went wrong"
        body="This screen hit a problem it didn't expect. Your data is safe: nothing was sent or changed because of it."
        reference={error.digest}
        actions={
          <>
            <Button onClick={reset} icon={<RefreshCw className="size-4" aria-hidden />}>
              Try again
            </Button>
            <ButtonLink href="/app/overview" variant="secondary" icon={<Home className="size-4" aria-hidden />}>
              Go to dashboard
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}

/** Shared card for error and not-found pages: logo, short message, actions. */
export function BrandedMessage({
  eyebrow,
  title,
  body,
  reference,
  actions,
  tone = "danger",
}: {
  eyebrow: string;
  title: string;
  body: string;
  reference?: string;
  actions: React.ReactNode;
  tone?: "danger" | "neutral";
}) {
  return (
    <div role="alert" className="w-full max-w-md rounded-[16px] border border-line bg-surface p-7 text-center shadow-[0_12px_40px_rgb(17_17_17/0.08)]">
      <LogoMark className="mx-auto size-20" />
      <p className="mt-3 flex items-baseline justify-center text-[18px] leading-none text-ink">
        <span className="font-semibold tracking-tight">Ops</span>
        <span className="display italic">Warden</span>
      </p>
      <p className={tone === "danger" ? "mt-5 text-[12.5px] font-medium text-danger" : "mt-5 text-[12.5px] font-medium text-ink-3"}>{eyebrow}</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      {reference ? <p className="mt-2 font-mono text-[11px] text-ink-3">ref {reference}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}
