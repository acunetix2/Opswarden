import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { SITE } from "@/lib/site";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "./nav-config";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-[#0f1217] text-[#F3EEE3]">
      <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(50%_60%_at_85%_0%,rgb(238_106_36/0.16),transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-10 sm:px-6">
        {/* Top band: brand and contact */}
        <div className="grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="OpsWarden home">
              <span className="grid size-11 place-items-center rounded-[12px] bg-[#fffdf9]">
                <LogoMark className="size-9" />
              </span>
              <span className="flex items-baseline text-[21px] leading-none">
                <span className="font-semibold tracking-tight">Ops</span>
                <span className="display italic">Warden</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[#F3EEE3]/65">
              Three-way matching for purchase orders, delivery receipts and invoices, with evidence on every finding and a person
              approving every next step.
            </p>
            <a
              href={`mailto:${SITE.supportEmail}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] text-[#F3EEE3]/85 transition-colors hover:border-white/30 hover:text-[#F3EEE3]"
            >
              <Mail className="size-3.5" aria-hidden />
              {SITE.supportEmail}
            </a>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#F3EEE3]/45">{col.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[14px] text-[#F3EEE3]/75 transition-colors duration-150 hover:text-[#F3EEE3]">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Call to action strip */}
        <div className="flex flex-col gap-4 border-b border-white/10 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[18px] font-semibold tracking-[-0.01em]">Ready to run your first three-way match?</p>
          <div className="flex gap-2">
            <Link href="/login" className="btn inline-flex h-10 items-center rounded-[8px] bg-brand px-4 text-[14px] font-medium text-on-brand hover:bg-brand-strong">
              Sign in
            </Link>
            <Link href="/contact" className="btn inline-flex h-10 items-center gap-1 rounded-[8px] border border-white/20 px-4 text-[14px] font-medium hover:bg-white/10">
              Book a walkthrough
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* Legal bar */}
        <div className="flex flex-col gap-4 pt-6 text-[12.5px] text-[#F3EEE3]/55 md:flex-row md:items-center md:justify-between">
          <p>&copy; {year} {SITE.legalName}. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-[#F3EEE3]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-[12px] text-[#F3EEE3]/40">
          OpsWarden compares documents and drafts messages for people to approve. It does not provide legal, tax or accounting advice.
        </p>
      </div>
    </footer>
  );
}
