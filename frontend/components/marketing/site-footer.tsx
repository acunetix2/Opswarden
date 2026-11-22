import Link from "next/link";

import { LogoMark } from "@/components/layout/logo";
import { SITE } from "@/lib/site";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "./nav-config";

/** Compact footer: brand and three short link columns, then one legal line. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-canvas text-ink">
      <div className="mx-auto max-w-5xl px-5 pt-12 pb-8 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-xs">
            <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="OpsWarden home">
              <LogoMark className="size-8 transition-transform duration-300 ease-out group-hover:rotate-[-6deg]" />
              <span className="flex items-baseline text-[19px] leading-none">
                <span className="font-semibold tracking-tight">Ops</span>
                <span className="display italic">Warden</span>
              </span>
            </Link>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">
              Every line of every invoice, <span className="display text-[1.1em] italic text-ink-2">checked</span> before it&apos;s paid.
            </p>
            <a href={`mailto:${SITE.supportEmail}`} className="mt-3 inline-block text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              {SITE.supportEmail}
            </a>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-3 gap-x-10 gap-y-6 sm:gap-x-14">
            {FOOTER_COLUMNS.filter((col) => col.title !== "Solutions").map((col) => (
              <div key={col.title}>
                <h2 className="text-[12.5px] font-medium text-ink-3">{col.title}</h2>
                <ul className="mt-3 space-y-2">
                  {col.links.slice(0, 4).map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[13.5px] text-ink-2 transition-colors duration-150 hover:text-ink">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 text-[12px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {SITE.legalName}. OpsWarden drafts messages for people to approve; it isn&apos;t legal, tax or accounting advice.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-ink">
                  {l.label.replace(" Policy", "").replace("Terms of Service", "Terms")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
