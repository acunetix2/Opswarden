import Link from "next/link";
import { FileSearch, ShieldCheck, Signature } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";

const PRINCIPLES = [
  { Icon: FileSearch, title: "Evidence on every finding", text: "Each discrepancy points to the document and field it came from." },
  { Icon: ShieldCheck, title: "Checked by rules", text: "Quantities, prices and totals are compared, never guessed." },
  { Icon: Signature, title: "People approve", text: "Nothing leaves the workspace without a recorded sign-off." },
];

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
 * Sign-in frame. Left: brand panel over a background image (public/auth-bg.svg,
 * replaceable with a photo). Right: a clean form card with the logo on light
 * paper so it is always clearly visible.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  const year = new Date().getFullYear();
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel with background image */}
      <section
        className="relative hidden overflow-hidden text-[#F3EEE3] lg:flex lg:flex-col"
        style={{
          backgroundColor: "#11151c",
          backgroundImage: "linear-gradient(180deg, rgb(11 13 17 / 0.15) 0%, rgb(11 13 17 / 0.55) 60%, rgb(11 13 17 / 0.9) 100%), url(/auth-bg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-14">
          <Link href="/" aria-label="OpsWarden home" className="flex w-fit items-center gap-3 rounded-[14px] bg-[#fffdf9] py-2 pr-4 pl-2 text-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)]">
            <LogoMark className="size-10" />
            <Wordmark className="text-[20px]" />
          </Link>

          <div className="max-w-lg">
            <p className="text-[13px] font-medium text-[#f6a15a]">Procurement investigations</p>
            <h2 className="mt-3 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] xl:text-[46px]">
              Catch billing mistakes before they become payments.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#F3EEE3]/75">
              OpsWarden compares purchase orders, delivery receipts and invoices, shows exactly where they disagree, and keeps every
              decision on record.
            </p>
            <ul className="mt-8 space-y-3">
              {PRINCIPLES.map(({ Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#ee6a24]/20 text-[#f6a15a]">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold">{title}</span>
                    <span className="block text-[13px] leading-snug text-[#F3EEE3]/70">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12.5px] text-[#F3EEE3]/60">&copy; {year} OpsWarden. All rights reserved.</p>
        </div>
      </section>

      {/* Form */}
      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="rounded-[18px] border border-line bg-surface p-7 shadow-[0_18px_50px_rgb(17_17_17/0.08)] sm:p-8">
            <Link href="/" aria-label="OpsWarden home" className="mx-auto flex w-fit flex-col items-center gap-2 text-ink">
              <LogoMark className="size-16" />
              <Wordmark className="text-[22px]" />
            </Link>
            <div className="mt-6 text-center">
              <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
              {description ? <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{description}</p> : null}
            </div>
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-5">{footer}</div> : null}
          <p className="mt-6 text-center text-[12px] text-ink-3 lg:hidden">&copy; {year} OpsWarden. All rights reserved.</p>
        </div>
      </section>
    </main>
  );
}
