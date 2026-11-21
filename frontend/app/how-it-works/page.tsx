import type { Metadata } from "next";
import { Bot, FileSearch, FolderPlus, ScanSearch, Signature, Upload, UserCheck } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "How it works",
  description: "From three documents to a signed-off answer in six steps, with a person deciding at every step that matters.",
};

const STEPS = [
  { Icon: FolderPlus, who: "Contributor", title: "Open a case", text: "Name the supplier and the purchase order you want to check. The draft is saved as you go." },
  { Icon: Upload, who: "Contributor", title: "Upload the three records", text: "Purchase order, supplier invoice and delivery receipt. Each file is checked for type and size and stored privately." },
  { Icon: ScanSearch, who: "Agent", title: "Run the analysis", text: "The agent extracts fields, matches line items by SKU or description, and applies the comparison rules. Progress shows live on the case." },
  { Icon: FileSearch, who: "Reviewer", title: "Review each finding", text: "Confirm what's real, dismiss what isn't (with a reason). Wrongly read fields can be corrected and the analysis re-run." },
  { Icon: Signature, who: "Reviewer", title: "Approve the supplier letter", text: "OpsWarden drafts a letter from confirmed facts only. A reviewer reads the exact text and signs it off; editing voids the approval." },
  { Icon: UserCheck, who: "Reviewer", title: "Resolve and report", text: "When the supplier answers, mark the case resolved with the outcome, and print the report for your records." },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="How it works"
        title="From three documents to a signed-off answer"
        intro="Six steps, one record. Software does the reading and arithmetic; people make every decision that leaves the building."
      />

      <Section title="The case lifecycle">
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[23px] before:w-px before:bg-line-strong sm:before:left-[27px]">
          {STEPS.map(({ Icon, who, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 40} className="relative flex gap-5">
              <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-[0_1px_2px_rgb(17_17_17/0.05)] sm:size-14">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="flex-1 rounded-[18px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-ink-3">Step {i + 1}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${who === "Agent" ? "bg-info-soft text-info" : "bg-surface-muted text-ink-2"}`}>{who}</span>
                </div>
                <h3 className="mt-2 text-[17px] font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section muted eyebrow="Division of labour" title="What the agent does, and what it never does">
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[18px] border border-line bg-surface p-6">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Bot className="size-5 text-info" aria-hidden /> The agent
              </p>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-ink-2">
                <li>Reads and extracts fields from each document</li>
                <li>Matches line items across the three records</li>
                <li>Applies deterministic rules and tolerances</li>
                <li>Records each mismatch with its evidence</li>
                <li>Drafts the supplier letter from confirmed facts</li>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="h-full rounded-[18px] border border-line bg-surface p-6">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <UserCheck className="size-5 text-success" aria-hidden /> Your team
              </p>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-ink-2">
                <li>Decides which findings are real</li>
                <li>Corrects anything that was read wrongly</li>
                <li>Approves every message before it is sent</li>
                <li>Agrees the outcome with the supplier</li>
                <li>Never has payments or ledgers changed for them</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <ClosingCta />
    </MarketingShell>
  );
}
