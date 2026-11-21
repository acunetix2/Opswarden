import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  FileSearch,
  FileStack,
  History,
  Lock,
  MessageSquareText,
  Plus,
  ScanSearch,
  ShieldCheck,
  Signature,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";

import { LandingCta } from "./landing-cta";
import { MatchDemo } from "./match-demo";
import { Reveal } from "./reveal";

/* Real rule categories from backend/app/services/comparison_service.py. No invented metrics anywhere on this page. */
const CHECKS = [
  "Quantities ordered, received and invoiced",
  "Unit prices against the PO",
  "Line totals and invoice totals",
  "PO references on every document",
  "Duplicate invoice numbers",
  "Currency mismatches",
  "Missing documents",
];

const STEPS: { Icon: typeof Upload; title: string; text: string }[] = [
  { Icon: Upload, title: "File the three records", text: "Upload the purchase order, supplier invoice and delivery receipt. Files stay private to your workspace." },
  { Icon: ScanSearch, title: "Run the analysis", text: "The agent reads each document and compares them line by line with fixed rules, never a model's guess." },
  { Icon: FileSearch, title: "Review the findings", text: "Every mismatch cites the document and field it came from. Confirm what's real, dismiss what isn't." },
  { Icon: Signature, title: "Approve, then send", text: "OpsWarden drafts the supplier letter. A reviewer signs it off before anything leaves the building." },
];

const FAQ: [string, string][] = [
  [
    "Does OpsWarden pay, block or change invoices?",
    "No. It never touches payments, bank details or your ledger. It tells you what disagrees and helps you ask the supplier, with a person approving every message.",
  ],
  [
    "Is AI deciding what counts as a discrepancy?",
    "No. Quantities, prices and totals are compared by deterministic rules with tolerances you set. An optional AI model only rephrases the supplier letter, and any rewrite that changes a fact is discarded.",
  ],
  [
    "What files can I upload?",
    "Digital PDFs and JSON exports work best. Each document is checked for type and size on upload, and anything that can't be read is flagged instead of guessed.",
  ],
  [
    "Who can see our documents?",
    "Only members of your workspace. Access is checked on the server for every request, and document text is treated as untrusted input.",
  ],
  [
    "Can I keep a record for auditors?",
    "Yes. Every upload, correction, decision and approval is logged with who did it and when, and each case exports as a signed-off PDF report.",
  ],
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-baseline leading-none ${className ?? ""}`}>
      <span className="font-semibold tracking-tight">Ops</span>
      <span className="display italic">Warden</span>
    </span>
  );
}

function SectionHeading({ eyebrow, title, text, center }: { eyebrow: string; title: ReactNode; text?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-[13px] font-medium text-brand-ink">{eyebrow}</p>
      <h2 className="mt-2 text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[36px]">{title}</h2>
      {text ? <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{text}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Bento visuals */

function EvidenceVisual() {
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden>
      {[
        ["PO", "Quantity", "50", false],
        ["DR", "Received", "40", true],
        ["INV", "Quantity", "50", true],
      ].map(([code, field, value, flag]) => (
        <div key={String(code)} className={`rounded-[10px] border p-2.5 ${flag ? "border-brand/40 bg-brand-tint/60" : "border-line bg-canvas"}`}>
          <span className="rounded-[5px] border border-line bg-surface px-1 font-mono text-[10px] font-semibold text-ink-2">{code}</span>
          <p className="mt-2 text-[10.5px] text-ink-3">{field}</p>
          <p className={`text-[20px] font-semibold leading-none tabular ${flag ? "text-brand-ink" : "text-ink"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function ApprovalVisual() {
  const steps: [string, string, "done" | "now" | "next"][] = [
    ["Requested", "Riley", "done"],
    ["Sign-off", "You", "now"],
    ["Send", "After", "next"],
  ];
  return (
    <ol className="flex items-center gap-2" aria-hidden>
      {steps.map(([label, who, state], i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
              state === "done" ? "bg-success text-canvas" : state === "now" ? "bg-brand text-on-brand ring-4 ring-brand-tint" : "bg-surface-sunken text-ink-3"
            }`}
          >
            {state === "done" ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-ink">{label}</span>
            <span className="block text-[11px] text-ink-3">{who}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function WardenVisual() {
  return (
    <div className="space-y-2" aria-hidden>
      <p className="ml-auto w-fit rounded-[12px] rounded-br-[3px] bg-ink px-3 py-1.5 text-[12px] text-canvas">What needs my attention?</p>
      <div className="flex items-start gap-2">
        <LogoMark className="size-6 shrink-0" />
        <p className="rounded-[12px] rounded-bl-[3px] border border-line bg-canvas px-3 py-1.5 text-[12px] leading-snug text-ink-2">
          2 letters waiting for approval and 1 case needing review. $165.50 in dispute.
        </p>
      </div>
    </div>
  );
}

function AuditVisual() {
  return (
    <ul className="space-y-1.5 text-[11.5px]" aria-hidden>
      {[
        ["09:12", "Riley", "Uploaded the delivery receipt"],
        ["09:13", "Agent", "Found 1 discrepancy"],
        ["09:40", "Avery", "Confirmed the finding"],
        ["10:05", "Avery", "Approved the supplier letter"],
      ].map(([t, who, what]) => (
        <li key={t} className="flex items-center gap-2 rounded-[8px] border border-line bg-canvas px-2.5 py-1.5">
          <span className="font-mono text-ink-3 tabular">{t}</span>
          <span className="font-medium text-ink">{who}</span>
          <span className="truncate text-ink-2">{what}</span>
        </li>
      ))}
    </ul>
  );
}

function Bento({ Icon, title, text, children, className }: { Icon: typeof Upload; title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <article className={`lift flex flex-col rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)] ${className ?? ""}`}>
      <span className="grid size-9 place-items-center rounded-[10px] bg-brand-tint text-brand-ink">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{text}</p>
      <div className="mt-auto pt-5">{children}</div>
    </article>
  );
}

/* ------------------------------------------------------------------------ Page */

/** Home page content. The header and footer come from MarketingShell (app/page.tsx). */
export function LandingView() {
  return (
    <>
      <div>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(60%_50%_at_75%_10%,rgb(238_106_36/0.14),transparent_70%),linear-gradient(to_right,rgb(17_17_17/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(17_17_17/0.04)_1px,transparent_1px)] [background-size:auto,44px_44px,44px_44px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-14 lg:pt-20 lg:pb-28">
            <div>
              <p className="hero-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-ink-2 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                Three-way matching, with people in control
              </p>
              <h1 className="hero-in mt-5 text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[54px]" style={{ animationDelay: "60ms" }}>
                Catch billing mistakes before they become <span className="text-brand-ink">payments</span>.
              </h1>
              <p className="hero-in mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2" style={{ animationDelay: "120ms" }}>
                OpsWarden compares your purchase orders, delivery receipts and invoices, shows exactly where they disagree, and keeps
                a person in charge of every next step.
              </p>
              <div className="hero-in mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "170ms" }}>
                <LandingCta className="h-11 px-5 text-[15px]" />
                <a
                  href="#how"
                  className="btn inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-5 text-[15px] font-medium text-ink hover:border-ink-3"
                >
                  See how it works
                </a>
              </div>
              <ul className="hero-in mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2" style={{ animationDelay: "220ms" }}>
                {["Every finding cites its source", "Nothing sent without approval", "Full audit trail"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hero-in" style={{ animationDelay: "140ms" }}>
              <MatchDemo />
            </div>
          </div>
        </section>

        {/* What it checks */}
        <section aria-label="What OpsWarden checks" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:px-6 lg:flex-row lg:items-center lg:gap-8">
            <p className="shrink-0 text-[13px] font-medium text-ink-3">Checked on every case</p>
            <ul className="flex flex-wrap gap-2">
              {CHECKS.map((c) => (
                <li key={c} className="rounded-full border border-line bg-canvas px-3 py-1 text-[12.5px] text-ink-2">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
            <Reveal>
              <SectionHeading
                eyebrow="How it works"
                title="From three documents to a signed-off answer"
                text="Four steps, one record. Each case moves through them in order, and the case page always tells you which one you're on."
              />
            </Reveal>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ Icon, title, text }, i) => (
                <Reveal as="li" key={title} delay={[0, 60, 110, 150][i]}>
                  {/* Reveal and hover-lift live on separate elements so their transitions don't override each other. */}
                  <div className="lift h-full rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
                    <span className="flex items-center justify-between">
                      <span className="grid size-9 place-items-center rounded-[10px] bg-canvas text-ink-2">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="font-mono text-[12px] text-ink-3">0{i + 1}</span>
                    </span>
                    <h3 className="mt-5 text-[16px] font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features (bento) */}
        <section id="features" className="scroll-mt-20 border-t border-line bg-surface-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
            <Reveal>
              <SectionHeading eyebrow="Features" title="Built for the people who sign the cheques" />
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-6">
              <Reveal className="md:col-span-4">
                <Bento Icon={FileStack} title="Evidence you can show a supplier" text="Each finding lines up the purchase order, receipt and invoice side by side, with the exact field and page it came from." className="h-full">
                  <EvidenceVisual />
                </Bento>
              </Reveal>
              <Reveal delay={60} className="md:col-span-2">
                <Bento Icon={BadgeCheck} title="Approval before anything leaves" text="Letters wait for a recorded sign-off. Editing after approval voids it." className="h-full">
                  <ApprovalVisual />
                </Bento>
              </Reveal>
              <Reveal className="md:col-span-3">
                <Bento Icon={MessageSquareText} title="Warden, your built-in guide" text="Ask what needs attention, find a case by PO number, or ask how to do anything." className="h-full">
                  <WardenVisual />
                </Bento>
              </Reveal>
              <Reveal delay={60} className="md:col-span-3">
                <Bento Icon={History} title="A record auditors can follow" text="Every upload, correction, decision and approval, with who did it and when." className="h-full">
                  <AuditVisual />
                </Bento>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-28">
            <Reveal>
              <SectionHeading
                eyebrow="Trust"
                title="Careful by design"
                text="OpsWarden is built for money questions, so it is deliberately conservative about what it does on its own."
              />
            </Reveal>
            <ul className="grid gap-3">
              {[
                [Signature, "People sign off", "Nothing leaves the workspace without an explicit approval. Payments and ledgers are out of scope."],
                [ShieldCheck, "Rules, not guesses", "Matching is deterministic with tolerances you set. The optional AI only rephrases letters and can't change a fact."],
                [Lock, "Workspaces stay apart", "Access is checked on the server for every request. Document text is treated as untrusted."],
              ].map(([Icon, title, text], i) => {
                const I = Icon as typeof Upload;
                return (
                  <Reveal as="li" key={String(title)} delay={[0, 60, 110][i]} className="flex items-start gap-4 rounded-[16px] border border-line bg-surface p-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink text-canvas">
                      <I className="size-[18px]" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[16px] font-semibold text-ink">{String(title)}</span>
                      <span className="mt-1 block text-[14px] leading-relaxed text-ink-2">{String(text)}</span>
                    </span>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-surface-muted/40">
          <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 lg:py-28">
            <Reveal>
              <SectionHeading eyebrow="FAQ" title="Questions people ask first" center />
            </Reveal>
            <div className="mt-10 space-y-2.5">
              {FAQ.map(([q, a]) => (
                <Reveal key={q}>
                  <details className="faq group rounded-[14px] border border-line bg-surface">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-ink">
                      {q}
                      <Plus className="chev size-4 shrink-0 text-ink-3" aria-hidden />
                    </summary>
                    <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-2">{a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 pb-20 sm:px-6">
          <Reveal className="mx-auto max-w-6xl">
            <div
              className="relative overflow-hidden rounded-[24px] px-8 py-14 text-[#F3EEE3] sm:px-12 sm:py-16"
              style={{
                backgroundColor: "#11151c",
                backgroundImage: "linear-gradient(100deg, rgb(11 13 17 / 0.92) 35%, rgb(11 13 17 / 0.45)), url(/auth-bg.svg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="relative max-w-xl">
                <h2 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[38px]">Investigate. Resolve. Move forward.</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-[#F3EEE3]/75">
                  The demo workspace comes with sample cases, so you can run the whole flow, from upload to approved letter, in a few minutes.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <LandingCta className="h-11 px-5 text-[15px]" />
                  <a
                    href="#how"
                    className="btn inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-white/20 px-5 text-[15px] font-medium text-[#F3EEE3] hover:bg-white/10"
                  >
                    How it works
                    <ArrowRight className="size-4" aria-hidden />
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </div>
    </>
  );
}
