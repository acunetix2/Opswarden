import type { Metadata } from "next";
import { FileSearch, FolderPlus, ScanSearch, Signature, Upload, Users, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = {
  title: "Help center",
  description: "Guides for every step of an OpsWarden case, frequently asked questions and a glossary of procurement terms.",
};

const GUIDES: { Icon: LucideIcon; title: string; steps: string[] }[] = [
  { Icon: FolderPlus, title: "Open your first case", steps: ["Go to Cases and press New investigation.", "Enter the supplier and PO reference.", "Continue: the draft is saved as you go."] },
  { Icon: Upload, title: "Upload documents", steps: ["Use the three slots on the case: PO, invoice, delivery receipt.", "Digital PDFs and JSON exports work best.", "Replace a file any time before the analysis."] },
  { Icon: ScanSearch, title: "Run the analysis", steps: ["Press Run analysis in the Analysis engine panel under the case title.", "Watch progress live on the page.", "Re-run after correcting a field."] },
  { Icon: FileSearch, title: "Review findings", steps: ["Confirm real discrepancies.", "Dismiss false alarms with a reason.", "Use Findings to decide on many at once."] },
  { Icon: Signature, title: "Approve a supplier letter", steps: ["Draft the letter at the bottom of the case.", "Request approval.", "A reviewer approves it in Approvals, then sends or exports it."] },
  { Icon: Users, title: "Invite your team", steps: ["Open Team & access (admins).", "Invite by email and choose a role.", "They accept from the link in the invitation."] },
];

const FAQ: [string, string][] = [
  ["Does OpsWarden pay, block or change invoices?", "No. It never touches payments, bank details or your ledger. It shows what disagrees and helps you ask the supplier, with a person approving every message."],
  ["Is AI deciding what counts as a discrepancy?", "No. Matching uses deterministic rules with tolerances you set. An optional model only rephrases supplier letters, and any rewrite that changes a fact is discarded."],
  ["What happens if a document can't be read?", "It's marked as failed with a reason, and you can replace it. OpsWarden never guesses missing values."],
  ["Can I correct a value that was read wrongly?", "Yes. Open the document's fields, correct the value with a reason, then re-run the analysis. The correction is logged."],
  ["Who can approve supplier letters?", "Admins and reviewers. A workspace policy can restrict approval to admins only."],
  ["How do I get a record for auditors?", "Open the case and press Report. It produces an A4 report you can print or save as PDF."],
  ["Is our data shared with other customers?", "No. Each workspace is isolated and every request is checked on the server."],
];

export default function ResourcesPage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="Resources" title="Help center" intro="Short guides for every step of a case, answers to common questions, and the terms you'll see in the app." />

      <Section title="Guides">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map(({ Icon, title, steps }, i) => (
            <Reveal key={title} delay={(i % 3) * 50}>
              <article className="lift h-full rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
                <span className="grid size-10 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <h3 className="mt-4 text-[16.5px] font-semibold text-ink">{title}</h3>
                <ol className="mt-3 space-y-1.5">
                  {steps.map((s, n) => (
                    <li key={s} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold text-ink-3">{n + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="faq" muted eyebrow="FAQ" title="Frequently asked questions">
        <div className="max-w-3xl space-y-2.5">
          {FAQ.map(([q, a]) => (
            <details key={q} className="faq group rounded-[14px] border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-ink">
                {q}
                <span aria-hidden className="chev grid size-6 shrink-0 place-items-center rounded-full border border-line text-ink-3">+</span>
              </summary>
              <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="glossary" eyebrow="Glossary" title="Terms you'll see in the app">
        <dl className="grid gap-3 md:grid-cols-2">
          {Object.entries(GLOSSARY).map(([term, def]) => (
            <Reveal key={term}>
              <div className="h-full rounded-[14px] border border-line bg-surface p-5">
                <dt className="text-[15px] font-semibold capitalize text-ink">{term}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{def}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </Section>
    </MarketingShell>
  );
}
