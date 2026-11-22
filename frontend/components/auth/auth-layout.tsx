import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-baseline leading-none ${className ?? ""}`}>
      <span className="font-semibold tracking-tight">Ops</span>
      <span className="display italic">Warden</span>
    </span>
  );
}

/**
 * Sign-in frame. Left: one real photograph (a parcel being packed for delivery,
 * CC0) and a single line of type. Right: the form, with nothing competing for
 * attention. Used by sign-in, sign-up, reset and invitation pages.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative isolate hidden overflow-hidden bg-[#0d1015] text-[#F3EEE3] lg:flex lg:flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/ships-out.jpg" alt="" aria-hidden className="auth-photo absolute inset-0 -z-10 h-full w-full object-cover object-[35%_50%]" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "linear-gradient(180deg, rgb(13 16 21 / 0.55) 0%, rgb(13 16 21 / 0.1) 35%, rgb(13 16 21 / 0.92) 100%)" }}
        />
        <div className="flex flex-1 flex-col justify-between p-12 xl:p-14">
          <Link href="/" aria-label="OpsWarden home" className="group flex w-fit items-center gap-2.5">
            <LogoMark className="size-9 transition-transform duration-300 ease-out group-hover:rotate-[-6deg]" />
            <Wordmark className="text-[20px]" />
          </Link>

          <div className="max-w-md">
            <p className="hero-in display text-[52px] leading-[0.98] xl:text-[60px]">
              Every line, <span className="italic text-[#EE6A24]">checked.</span>
            </p>
            <p className="hero-in mt-5 text-[15px] leading-relaxed text-[#F3EEE3]/70" style={{ animationDelay: "80ms" }}>
              Purchase order, delivery receipt and invoice, compared on every line before anything is paid.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="OpsWarden home" className="flex w-fit items-center gap-2.5 text-ink lg:hidden">
          <LogoMark className="size-8" />
          <Wordmark className="text-[18px]" />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            <h1 className="hero-in text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">{title}</h1>
            {description ? (
              <p className="hero-in mt-2 text-[14.5px] leading-relaxed text-ink-3" style={{ animationDelay: "40ms" }}>
                {description}
              </p>
            ) : null}
            <div className="hero-in mt-8" style={{ animationDelay: "80ms" }}>
              {children}
            </div>
            {footer ? (
              <div className="hero-in mt-8" style={{ animationDelay: "120ms" }}>
                {footer}
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-center text-[12px] text-ink-3 lg:text-left">&copy; {new Date().getFullYear()} OpsWarden</p>
      </section>
    </main>
  );
}
