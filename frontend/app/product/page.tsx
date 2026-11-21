import type { Metadata } from "next";
import { BadgeCheck, FileSearch, FileText, History, MessageSquareText, ScanSearch, Signature, Users } from "lucide-react";

import { MatchDemo } from "@/components/landing/match-demo";
import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, InfoCard, MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Product",
  description: "Three-way matching with evidence on every finding, approval before anything is sent, and a full audit trail.",
};

const CAPABILITIES = [
  { Icon: ScanSearch, title: "Automatic three-way match", text: "Purchase order, delivery receipt and invoice are read and compared line by line, by SKU or description." },
  { Icon: FileSearch, title: "Evidence on every finding", text: "Each discrepancy shows the expected and observed values and links to the exact document field and page." },
  { Icon: BadgeCheck, title: "People decide", text: "Reviewers confirm or dismiss each finding. Dismissals need a reason, and any decision can be reopened." },
  { Icon: Signature, title: "Approval before sending", text: "Supplier letters are drafted from confirmed facts and wait for a recorded sign-off. Editing voids the approval." },
  { Icon: FileText, title: "Formal case reports", text: "One click produces an A4 report with findings, evidence, the match table, approvals and sign-off lines." },
  { Icon: History, title: "Complete audit trail", text: "Uploads, corrections, findings, decisions and messages, with who did what and when." },
  { Icon: Users, title: "Roles that fit finance", text: "Admins, reviewers and contributors. Workspace policy can limit approvals to admins." },
  { Icon: MessageSquareText, title: "Warden, the built-in guide", text: "Ask what needs attention, find a case by PO number, or ask how to do anything." },
];

export default function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Product"
        title="Every invoice checked against what was ordered and delivered"
        intro="OpsWarden turns three documents into a clear answer: do they agree, and if not, exactly where and by how much. Then it helps your team settle it with the supplier, on the record."
      >
        <ButtonLink href="/login" variant="accent" className="h-11 px-5 text-[15px]">Sign in</ButtonLink>
        <ButtonLink href="/how-it-works" variant="secondary" className="h-11 px-5 text-[15px]">How it works</ButtonLink>
      </PageHero>

      <Section eyebrow="Capabilities" title="What OpsWarden does" intro="Everything a case needs, from upload to an approved supplier letter.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={(i % 4) * 50}>
              <InfoCard Icon={c.Icon} title={c.title}>{c.text}</InfoCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section muted eyebrow="Try it" title="The rule, live" intro="This is the real quantity rule: (invoiced − received) × unit price. Drag the slider to change what was delivered.">
        <Reveal className="mx-auto max-w-3xl">
          <MatchDemo />
        </Reveal>
      </Section>

      <Section eyebrow="On every case" title="What you see when you open a case">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["Progress you can follow", "Upload, analyse, review, email, resolve. The case page always shows the current step and exactly what to do next."],
              ["Numbers you can defend", "Totals are checked by rules with tolerances you set. Currencies are never added together."],
              ["A paper trail by default", "Every action is logged. Print the report and it's ready for an auditor or a supplier call."],
            ] as [string, string][]
          ).map(([t, d], i) => (
            <Reveal key={t} delay={i * 60}>
              <InfoCard title={t}>{d}</InfoCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <ClosingCta />
    </MarketingShell>
  );
}
