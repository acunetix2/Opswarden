"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/** The uploaded OpsWarden logo. Save the artwork to frontend/public/logo.png. */
export const LOGO_SRC = "/logo.png";

/**
 * OpsWarden mark. Renders the official logo image (public/logo.png). If that
 * file is missing it falls back to a vector redraw, so the app never shows a
 * broken image. `tone` is kept for API compatibility only.
 */
export function LogoMark({ className }: { className?: string; tone?: "light" | "dark" }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image can fail before React hydrates, in which case onError never fires; check once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <LogoVector className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static asset, no optimisation needed
    <img
      ref={imgRef}
      src={LOGO_SRC}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("size-8 select-none object-contain", className)}
    />
  );
}

/** Vector fallback of the logo: dark shield, white check, orange swoosh, data pixels. */
function LogoVector({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `ow-${name}-${uid}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={id("shield")} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#4a5568" />
          <stop offset="0.45" stopColor="#252e3b" />
          <stop offset="1" stopColor="#10151d" />
        </linearGradient>
        <linearGradient id={id("inner")} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#263244" />
          <stop offset="1" stopColor="#0a0e14" />
        </linearGradient>
        <linearGradient id={id("check")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c3ccd8" />
        </linearGradient>
        <linearGradient id={id("ring")} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor="#d9321a" />
          <stop offset="0.55" stopColor="#ee6a24" />
          <stop offset="1" stopColor="#f6b233" />
        </linearGradient>
      </defs>
      <path d="M48.5 19.6c8.6.7 13.2 4.3 11 9.9-1.3-2.6-4.7-4.6-9.5-5.4z" fill={`url(#${id("ring")})`} />
      <path d="M30 5.5 49.5 12v18c0 13.6-8.1 22.8-19.5 28.5C18.6 52.8 10.5 43.6 10.5 30V12z" fill={`url(#${id("shield")})`} />
      <path d="M30 10.4 45.2 15.6V30c0 11-6.5 18.7-15.2 23.4C21.3 48.7 14.8 41 14.8 30V15.6z" fill={`url(#${id("inner")})`} />
      <path d="M14.8 15.6 30 10.4l15.2 5.2v4.6c-7.4-3-22.6-3-30.4 1.6z" fill="#ffffff" opacity="0.08" />
      <path d="m20.4 30.6 7.1 7.1 13.2-15.3" fill="none" stroke={`url(#${id("check")})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M7.2 32.6c-3.6 7.6 4.6 14.2 20 13.1 13.4-1 26.5-7.6 32.3-16.2-7.5 6.6-20.4 11.3-31.9 12-12.6.8-19.2-2.7-20.4-8.9z"
        fill={`url(#${id("ring")})`}
      />
      <rect x="50.5" y="3.5" width="5" height="5" rx="0.8" fill="#ee6a24" />
      <rect x="57" y="1.5" width="3" height="3" rx="0.5" fill="#d9321a" />
      <rect x="56" y="8.5" width="4.2" height="4.2" rx="0.6" fill="#e9501f" />
      <rect x="61" y="6" width="2.6" height="2.6" rx="0.4" fill="#f6a12d" />
      <rect x="58.3" y="14.2" width="2.6" height="2.6" rx="0.4" fill="#d9321a" />
    </svg>
  );
}

/** Logo plus wordmark: "Ops" in the UI sans, "Warden" in the serif italic. */
export function Logo({ className, tone = "light", hideWordmark }: { className?: string; tone?: "light" | "dark"; hideWordmark?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9 shrink-0" />
      <span className={cn("flex items-baseline text-[21px] leading-none", tone === "light" ? "text-[#F3EEE3]" : "text-ink", hideWordmark)}>
        <span className="font-semibold tracking-tight">Ops</span>
        <span className="display italic">Warden</span>
      </span>
    </span>
  );
}
