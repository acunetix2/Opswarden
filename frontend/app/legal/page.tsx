import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { LEGAL_LINKS } from "@/components/marketing/nav-config";
import { MarketingShell, PageHero } from "@/components/marketing/marketing-shell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Legal", description: "OpsWarden terms, privacy, cookie and acceptable use policies." };

export default function LegalIndexPage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="Legal" title="Legal center" intro={`The agreements and policies that apply to OpsWarden. Last updated ${SITE.legalUpdated}.`} />
      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:grid-cols-2 sm:px-6 lg:py-20">
        {LEGAL_LINKS.map(({ href, label, Icon, summary }, i) => (
          <Reveal key={href} delay={(i % 2) * 60}>
            <Link href={href} className="lift group flex h-full items-start gap-4 rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] font-semibold text-ink">{label}</span>
                <span className="mt-1 block text-[14px] text-ink-2">{summary}</span>
              </span>
              <ArrowRight className="mt-1 size-4 text-ink-3 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Reveal>
        ))}
      </div>
    </MarketingShell>
  );
}
