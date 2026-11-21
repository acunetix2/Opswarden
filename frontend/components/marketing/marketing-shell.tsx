import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/landing/reveal";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Frame for every public page: header, content, footer. */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-brand"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Standard hero for inner pages: eyebrow, title, intro, optional actions. */
export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: ReactNode; intro: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(55%_60%_at_80%_0%,rgb(238_106_36/0.12),transparent_70%),linear-gradient(to_right,rgb(17_17_17/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(17_17_17/0.035)_1px,transparent_1px)] [background-size:auto,44px_44px,44px_44px] [mask-image:linear-gradient(to_bottom,black_50%,transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-14 sm:px-6 lg:pt-20 lg:pb-16">
        <p className="hero-in text-[13px] font-medium text-brand-ink">{eyebrow}</p>
        <h1 className="hero-in mt-3 max-w-3xl text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[48px]" style={{ animationDelay: "60ms" }}>
          {title}
        </h1>
        <div className="hero-in mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2" style={{ animationDelay: "120ms" }}>
          {intro}
        </div>
        {children ? (
          <div className="hero-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: "170ms" }}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Content section with consistent spacing and an optional heading. */
export function Section({ id, eyebrow, title, intro, children, muted }: { id?: string; eyebrow?: string; title?: ReactNode; intro?: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-20 ${muted ? "border-y border-line bg-surface-muted/40" : ""}`}>
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:py-24">
        {title ? (
          <Reveal className="mb-10 max-w-2xl">
            {eyebrow ? <p className="text-[13px] font-medium text-brand-ink">{eyebrow}</p> : null}
            <h2 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">{title}</h2>
            {intro ? <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{intro}</p> : null}
          </Reveal>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** Card used across marketing pages; lifts on hover only with a real pointer. */
export function InfoCard({ Icon, title, children }: { Icon?: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="lift h-full rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
          <Icon className="size-[18px]" aria-hidden />
        </span>
      ) : null}
      <h3 className={`${Icon ? "mt-4" : ""} text-[16.5px] font-semibold tracking-[-0.01em] text-ink`}>{title}</h3>
      <div className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

/** Closing call to action used at the bottom of marketing pages. */
export function ClosingCta({ title = "See it on your own documents", text = "The demo workspace comes with sample cases, so you can run the whole flow in a few minutes." }: { title?: string; text?: string }) {
  return (
    <section className="px-5 pb-20 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div
          className="relative overflow-hidden rounded-[24px] px-8 py-12 text-[#F3EEE3] sm:px-12 sm:py-14"
          style={{
            backgroundColor: "#11151c",
            backgroundImage: "linear-gradient(100deg, rgb(11 13 17 / 0.92) 35%, rgb(11 13 17 / 0.45)), url(/auth-bg.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <h2 className="max-w-xl text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">{title}</h2>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[#F3EEE3]/75">{text}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/login" className="btn inline-flex h-11 items-center rounded-[8px] bg-brand px-5 text-[15px] font-medium text-on-brand hover:bg-brand-strong">
              Sign in
            </a>
            <a href="/contact" className="btn inline-flex h-11 items-center rounded-[8px] border border-white/20 px-5 text-[15px] font-medium hover:bg-white/10">
              Talk to us
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
