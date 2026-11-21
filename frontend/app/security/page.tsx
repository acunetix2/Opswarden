import type { Metadata } from "next";
import Link from "next/link";
import { Database, Eye, FileLock2, KeyRound, Lock, ScrollText, ShieldCheck, Sparkles } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, InfoCard, MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security",
  description: "How OpsWarden protects your documents and decisions: access control, private storage, AI boundaries and a full audit trail.",
};

const CONTROLS = [
  { Icon: KeyRound, title: "Authentication", text: "Sign-in uses short-lived access tokens that are verified on every request, with secure password resets by email." },
  { Icon: Lock, title: "Workspace isolation", text: "Every request is checked for workspace membership on the server. Resources from other workspaces are reported as not found." },
  { Icon: ShieldCheck, title: "Role-based permissions", text: "Admin, reviewer and contributor roles are enforced by the API, not just hidden in the interface." },
  { Icon: FileLock2, title: "Private document storage", text: "Uploads are kept in private storage under random keys and are only ever served to signed-in members of the workspace." },
  { Icon: Database, title: "Encrypted in transit and at rest", text: "All traffic is encrypted, and stored records and documents are encrypted at rest." },
  { Icon: Sparkles, title: "Bounded AI", text: "Matching never uses AI. The optional model only rephrases letters from confirmed facts, and any rewrite that changes a fact is discarded." },
  { Icon: ScrollText, title: "Audit trail", text: "Uploads, corrections, findings, approvals and messages are logged with actor and time, and can't be edited from the app." },
  { Icon: Eye, title: "Untrusted input", text: "Document text is treated as data, never as instructions, and file types are checked by content on upload." },
];

export default function SecurityPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Security"
        title="Careful with your documents and your decisions"
        intro="OpsWarden handles purchase orders, invoices and supplier messages. It is built to keep them private and to make every decision traceable."
      />

      <Section title="Controls in place">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTROLS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 4) * 50}>
              <InfoCard Icon={c.Icon} title={c.title}>{c.text}</InfoCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section muted eyebrow="Scope" title="What OpsWarden will never do">
        <Reveal>
          <ul className="grid gap-3 sm:grid-cols-3">
            {["Move money, release or block payments", "Change bank details or ledger entries", "Send anything to a supplier without a recorded approval"].map((t) => (
              <li key={t} className="rounded-[14px] border border-line bg-surface px-4 py-4 text-[14.5px] font-medium text-ink">{t}</li>
            ))}
          </ul>
        </Reveal>
      </Section>

      <Section eyebrow="Disclosure" title="Found a vulnerability?">
        <Reveal className="max-w-2xl space-y-3 text-[15.5px] leading-relaxed text-ink-2">
          <p>
            Email <a className="font-medium text-brand-ink underline" href={`mailto:${SITE.securityEmail}`}>{SITE.securityEmail}</a> with the details and steps to reproduce.
            Please give us reasonable time to fix the issue before sharing it, and don&apos;t access data that isn&apos;t yours.
          </p>
          <p>
            The third parties that process data for the service are listed in the{" "}
            <Link href="/legal/privacy#subprocessors" className="font-medium text-brand-ink underline">Privacy Policy</Link>.
          </p>
        </Reveal>
      </Section>

      <ClosingCta />
    </MarketingShell>
  );
}
