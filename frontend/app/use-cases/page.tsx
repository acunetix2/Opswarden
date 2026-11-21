import type { Metadata } from "next";
import { Calculator, ClipboardCheck, Receipt, Workflow, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, MarketingShell, PageHero } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "Use cases",
  description: "How accounts payable, procurement, finance controllers and internal audit use OpsWarden.",
};

const CASES: { id: string; Icon: LucideIcon; team: string; problem: string; how: string[]; outcome: string }[] = [
  {
    id: "accounts-payable",
    Icon: Receipt,
    team: "Accounts payable",
    problem: "Invoices arrive faster than anyone can check them against receipts, and short deliveries get paid in full.",
    how: ["Upload the PO, invoice and receipt for anything that looks off", "See the exact units and money in dispute in seconds", "Hold the invoice with a clear, evidenced reason"],
    outcome: "Fewer overpayments and a documented reason every time an invoice is held.",
  },
  {
    id: "procurement",
    Icon: Workflow,
    team: "Procurement teams",
    problem: "Price changes and substitutions slip through, and supplier conversations rely on memory and screenshots.",
    how: ["Catch unit prices above the agreed PO price", "Send a factual, approved clarification letter", "Track which suppliers cause the most discrepancies"],
    outcome: "Supplier conversations based on evidence, not opinions.",
  },
  {
    id: "finance-controllers",
    Icon: Calculator,
    team: "Finance controllers",
    problem: "You need to know how much money is in dispute and who signed off what, without chasing spreadsheets.",
    how: ["See value in dispute per currency on the Exposure page", "Restrict approvals to admins by workspace policy", "Follow monthly trends on Analytics"],
    outcome: "A live view of disputed value and a clean approval chain.",
  },
  {
    id: "audit",
    Icon: ClipboardCheck,
    team: "Internal audit",
    problem: "Proving that controls were followed means reconstructing who saw what, and when.",
    how: ["Every upload, correction, decision and message is logged", "Each case exports as a signed-off A4 report", "Dismissed findings keep their reason on record"],
    outcome: "Evidence of control without extra work for the team.",
  },
];

export default function UseCasesPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Use cases"
        title="One record for everyone who touches an invoice"
        intro="Different teams ask different questions about the same three documents. OpsWarden answers all of them from one case."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-16 sm:px-6 lg:py-20">
        {CASES.map(({ id, Icon, team, problem, how, outcome }) => (
          <Reveal key={id}>
            <section id={id} className="scroll-mt-24 grid gap-6 rounded-[20px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)] sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
              <div>
                <span className="grid size-11 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.015em] text-ink">{team}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{problem}</p>
              </div>
              <div className="space-y-4">
                <ul className="space-y-2">
                  {how.map((h) => (
                    <li key={h} className="flex gap-3 rounded-[12px] border border-line bg-canvas/60 px-4 py-3 text-[14.5px] text-ink">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                      {h}
                    </li>
                  ))}
                </ul>
                <p className="rounded-[12px] border border-success/25 bg-success-soft/50 px-4 py-3 text-[14px] text-ink-2">
                  <span className="font-semibold text-success">Outcome: </span>
                  {outcome}
                </p>
              </div>
            </section>
          </Reveal>
        ))}
      </div>
      <ClosingCta />
    </MarketingShell>
  );
}
