import Link from "next/link";
import type { ReactNode } from "react";

import { SITE } from "@/lib/site";

import { LEGAL_LINKS } from "./nav-config";
import { MarketingShell } from "./marketing-shell";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Long-form legal page: title block, a sticky table of contents, readable
 * prose at ~70 characters a line, and links to the sibling policies.
 */
export function LegalDoc({ title, intro, sections, current }: { title: string; intro: ReactNode; sections: LegalSection[]; current: string }) {
  return (
    <MarketingShell>
      <div className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
            <Link href="/legal" className="hover:text-ink">Legal</Link>
            <span aria-hidden className="mx-2">/</span>
            <span className="text-ink">{title}</span>
          </nav>
          <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.025em] sm:text-[42px]">{title}</h1>
          <p className="mt-2 text-[13.5px] text-ink-3">Last updated {SITE.legalUpdated}</p>
          <div className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">{intro}</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">On this page</p>
          <ol className="mt-3 space-y-1.5 border-l border-line">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-[13.5px] text-ink-2 hover:border-ink-3 hover:text-ink">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Other policies</p>
          <ul className="mt-3 space-y-1.5">
            {LEGAL_LINKS.filter((l) => l.href !== current).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[13.5px] text-ink-2 hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <article className="legal-prose max-w-[68ch]">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line pb-8 mb-8 last:mb-0 last:border-b-0">
              <h2>
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
          <p className="rounded-[12px] border border-line bg-surface px-4 py-3 text-[13.5px] text-ink-2">
            Questions about this policy? Email{" "}
            <a href={`mailto:${SITE.legalEmail}`} className="font-medium text-brand-ink hover:underline">
              {SITE.legalEmail}
            </a>
            .
          </p>
        </article>
      </div>
    </MarketingShell>
  );
}
