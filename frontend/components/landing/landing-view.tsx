import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { AgentRunDemo } from "./agent-run-demo";
import { LandingCta } from "./landing-cta";
import { InvoicePaper, PurchaseOrderPaper, ReceiptPaper } from "./paper-docs";
import { Reveal } from "./reveal";

/*
 * Home page. Everything on it is real: rule ids come from
 * backend/app/services/comparison_service.py, the case timeline follows the events
 * OpsWarden records. Photos are CC0 or CC BY (see public/landing/credits.json).
 */

const RULES: [string, string][] = [
  ["INVOICE_QTY_GT_RECEIVED", "Billed for more units than arrived"],
  ["UNIT_PRICE_MISMATCH", "Unit price differs from the purchase order"],
  ["PRICE_ABOVE_HISTORY", "Price is higher than this supplier charged last time"],
  ["RECEIVED_QTY_LT_ORDERED", "Delivery was short of the order"],
  ["TOTAL_MISMATCH", "Lines don't add up to the invoice total"],
  ["DUPLICATE_INVOICE", "Same invoice number seen before"],
  ["SUPPLIER_MISMATCH", "Supplier differs across the three documents"],
];

/* One case, start to finish, in the order OpsWarden records it. */
const TIMELINE: { at: string; who: string; what: ReactNode; person?: boolean }[] = [
  { at: "09:12", who: "Inbox", what: "Northstar forwards invoice INV-8821 to the workspace address" },
  { at: "09:12", who: "OpsWarden", what: "Reads it, finds PO-1048 in the register and files it on OW-2026-0042" },
  { at: "09:13", who: "OpsWarden", what: <>Three-way match: 1 finding, <Figure>$120.00</Figure> in dispute</> },
  { at: "09:13", who: "OpsWarden", what: "Drafts the supplier letter and emails the approver" },
  { at: "10:05", who: "Avery", what: "Reads the evidence and approves. The letter is sent.", person: true },
  { at: "+3 days", who: "Northstar", what: <>Replies with credit note CN-55. Case closed, <Figure>$120.00</Figure> recovered</> },
];

const PRINCIPLES: { subject: string; verb: string; text: string }[] = [
  { subject: "The model", verb: "reads.", text: "Scans and photos are transcribed by a vision model. A number only counts as read if the page's own arithmetic agrees." },
  { subject: "The code", verb: "decides.", text: "Matching, amounts and severity come from fixed rules with exact decimals and tolerances you set." },
  { subject: "A person", verb: "approves.", text: "Nothing reaches a supplier until someone approves the exact text. Change a character and the approval is void." },
];

const FAQ: [string, string][] = [
  ["Does OpsWarden pay or block invoices?", "No. It never touches payments, bank details or your ledger. It shows what disagrees and writes to the supplier once a person approves."],
  ["What does it do without me?", "It files documents, saves suppliers and PO numbers to the register, closes cases where all three documents agree, drafts letters and reminders, and records credit notes. Each of these can be switched off."],
  ["Which files work?", "PDFs, scans and photos, JSON or text exports. Files are checked for type and size, and anything that can't be read is flagged rather than guessed."],
  ["Who can see our documents?", "Only members of your workspace. Access is checked on the server for every request, and files sit in private storage."],
];

function Figure({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.95em] font-medium text-ink tabular">{children}</span>;
}

/** Serif italic accent inside sans headlines, a touch larger so the x-heights line up. */
function Em({ children, className = "text-brand-ink" }: { children: ReactNode; className?: string }) {
  return <em className={`display text-[1.14em] font-normal italic leading-none ${className}`}>{children}</em>;
}

function SectionLabel({ n, children, inverse }: { n: string; children: ReactNode; inverse?: boolean }) {
  return (
    <p className={`flex items-center gap-3 font-mono text-[12px] ${inverse ? "text-[#F3EEE3]/55" : "text-ink-3"}`}>
      <span className="tabular">{n}</span>
      <span aria-hidden className={`h-px w-8 ${inverse ? "bg-[#F3EEE3]/30" : "bg-line-strong"}`} />
      <span>{children}</span>
    </p>
  );
}

/** A hand-drawn stroke under the key words. Draws once on load. */
function Underline() {
  return (
    <svg aria-hidden viewBox="0 0 320 18" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-[0.16em] left-0 h-[0.3em] w-full overflow-visible">
      <path d="M3 12 C 70 4, 150 3, 210 7 S 290 13, 317 6" className="draw-line" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The receipt and invoice from the sample case, fanned out beside the headline. */
function PaperStack() {
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto h-[360px] w-full max-w-[30rem] sm:h-[420px]">
      <div className="paper-float absolute top-0 left-0 w-[72%] rotate-[-8deg]">
        <ReceiptPaper />
      </div>
      <div className="paper-float absolute right-0 bottom-0 w-[70%] rotate-[6deg]" style={{ animationDelay: "-3s" }}>
        <InvoicePaper />
      </div>
    </div>
  );
}

/** Home page content. The header and footer come from MarketingShell (app/page.tsx). */
export function LandingView() {
  return (
    <>
      {/* Hero: a stockroom being checked, the claim, and the product to touch. */}
      <section className="relative isolate overflow-hidden bg-[#0d1015] text-[#F3EEE3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/stockroom.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_40%]" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(90deg, rgb(13 16 21 / 0.96) 0%, rgb(13 16 21 / 0.86) 42%, rgb(13 16 21 / 0.45) 75%, rgb(13 16 21 / 0.3) 100%), linear-gradient(to top, rgb(13 16 21 / 0.9), transparent 40%)",
          }}
        />
        <div className="mx-auto grid max-w-6xl gap-14 px-5 pt-28 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pt-36 lg:pb-28">
          <div>
            <p className="hero-in font-mono text-[12px] text-[#F3EEE3]/60">Purchase order · delivery receipt · invoice</p>
            <h1
              className="hero-in mt-5 text-[44px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[60px] lg:text-[68px]"
              style={{ animationDelay: "50ms" }}
            >
              Stop paying for goods that{" "}
              <span className="relative inline-block whitespace-nowrap text-[#EE6A24]">
                <em className="display text-[1.16em] font-normal italic tracking-[-0.01em]">never arrived.</em>
                <Underline />
              </span>
            </h1>
            <p className="hero-in mt-7 max-w-[33rem] text-[17px] leading-[1.65] text-[#F3EEE3]/75" style={{ animationDelay: "100ms" }}>
              OpsWarden checks the purchase order, delivery receipt and invoice against each other, shows every difference with
              the line it came from, and drafts the letter to your supplier. You approve it, and it&apos;s sent.
            </p>
            <div className="hero-in mt-9 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "150ms" }}>
              <LandingCta className="h-11 px-5 text-[15px]" signup />
              <a href="#watch" className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-[#F3EEE3]/80 hover:text-[#F3EEE3]">
                Watch it work
                <ArrowDown className="size-4 transition-transform duration-200 ease-out group-hover:translate-y-0.5" aria-hidden />
              </a>
            </div>
          </div>
          <div className="hero-in relative lg:pl-4" style={{ animationDelay: "180ms" }}>
            <PaperStack />
          </div>
        </div>
      </section>

      {/* Watch it work: the in-app stage view, replayed on the sample case. */}
      <section id="watch" aria-labelledby="watch-title" className="scroll-mt-16 overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <Reveal className="max-w-2xl">
            <SectionLabel n="01">Watch it work</SectionLabel>
            <h2 id="watch-title" className="mt-6 text-[36px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[50px]">
              Three documents in. <Em>One answer</Em> out.
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-[1.7] text-ink-2">
              This is the screen you see while OpsWarden works on a case: it reads each document, updates the register, runs
              the match, weighs what it found and queues the letter. About seven seconds here. Sample data.
            </p>
          </Reveal>
          <div className="mt-14">
            <AgentRunDemo />
          </div>
        </div>
      </section>

      {/* The paperwork itself: today's PO, receipt and invoice, marked where they disagree. */}
      <section id="paperwork" aria-labelledby="paperwork-title" className="scroll-mt-16 overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16 lg:py-28">
          <Reveal>
            <SectionLabel n="02">The paperwork</SectionLabel>
            <h2 id="paperwork-title" className="mt-6 text-[36px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[50px]">
              Three documents. <Em>One number</Em> doesn&apos;t match.
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-[1.7] text-ink-2">
              The order says 50 binders. The warehouse signed for 40. The invoice charges for 50. Spotting that by eye means
              holding three pages side by side, line by line, for every delivery.
            </p>
            <dl className="mt-8 grid max-w-md grid-cols-3 border-t border-line pt-5">
              {[
                ["Ordered", "50"],
                ["Received", "40"],
                ["Invoiced", "50"],
              ].map(([k, v], i) => (
                <div key={k}>
                  <dt className="text-[12.5px] text-ink-3">{k}</dt>
                  <dd className={`mt-1 font-mono text-[28px] font-medium tabular ${i === 1 ? "text-brand-ink" : "text-ink"}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={80}>
            <div className="relative mx-auto h-[440px] w-full max-w-[34rem] sm:h-[480px]">
              <div className="paper-float absolute top-0 left-0 w-[66%] rotate-[-6deg]">
                <PurchaseOrderPaper />
              </div>
              <div className="paper-float absolute top-[24%] right-0 w-[64%] rotate-[4deg]" style={{ animationDelay: "-2.5s" }}>
                <ReceiptPaper />
              </div>
              <div className="paper-float absolute bottom-0 left-[8%] w-[70%] rotate-[-1.5deg]" style={{ animationDelay: "-5s" }}>
                <InvoicePaper />
              </div>
              <p className="absolute -bottom-2 right-0 max-w-[13rem] rotate-[-2deg] rounded-[10px] bg-ink px-3.5 py-2.5 text-[12.5px] leading-snug text-canvas shadow-[0_16px_30px_-14px_rgb(17_17_17/0.6)]">
                <span className="font-mono text-brand">INVOICE_QTY_GT_RECEIVED</span>
                <br />
                10 × $12.00 = <span className="font-mono font-medium">$120.00</span> in dispute
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What gets checked: an inverse band, read like a ledger. */}
      <section aria-labelledby="checks-title" className="bg-[#11151c] text-[#F3EEE3]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-24">
          <Reveal>
            <SectionLabel n="03" inverse>What gets checked</SectionLabel>
            <h2 id="checks-title" className="mt-6 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[46px]">
              Every case runs the <Em className="text-[#EE6A24]">same</Em> rules.
            </h2>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-[#F3EEE3]/70">
              Each finding names its rule, the expected and actual values, the money at stake and the document field it came
              from. You can always see why.
            </p>
          </Reveal>
          <Reveal delay={60}>
            <ol className="border-t border-[#F3EEE3]/15">
              {RULES.map(([id, text], i) => (
                <li key={id} className="grid grid-cols-[2rem_1fr] gap-x-4 border-b border-[#F3EEE3]/15 py-3.5 sm:grid-cols-[2rem_16rem_1fr] sm:items-baseline">
                  <span className="font-mono text-[12px] text-[#F3EEE3]/40 tabular">{String(i + 1).padStart(2, "0")}</span>
                  <code className="font-mono text-[12px] text-[#EE6A24]">{id}</code>
                  <span className="col-start-2 text-[15px] text-[#F3EEE3]/90 sm:col-start-auto">{text}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* One case, start to finish. */}
      <section id="case" aria-labelledby="case-title" className="scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-28">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <SectionLabel n="04">One case</SectionLabel>
            <h2 id="case-title" className="mt-6 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[46px]">
              One decision for a person. <Em>The rest</Em> is done for you.
            </h2>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-ink-2">
              A short delivery as it moves through OpsWarden, in the order the activity log records it. Sample data.
            </p>
          </Reveal>

          <ol className="relative">
            <span aria-hidden className="absolute top-3 bottom-3 left-[5.4rem] w-px bg-line sm:left-[6.9rem]" />
            {TIMELINE.map((step, i) => (
              <Reveal
                as="li"
                key={i}
                delay={[0, 40, 80, 110, 140, 170][i]}
                className={`relative grid grid-cols-[4.5rem_1fr] gap-x-6 sm:grid-cols-[6rem_1fr] ${step.person ? "my-3 rounded-[14px] bg-brand-tint/70 py-4" : "py-3"}`}
              >
                <span className="pt-0.5 text-right font-mono text-[12.5px] text-ink-3 tabular">{step.at}</span>
                <div className="relative pl-6 pr-4">
                  <span
                    aria-hidden
                    className={
                      step.person
                        ? "absolute top-[4px] -left-[7.5px] size-[15px] rounded-full border-[3px] border-canvas bg-brand"
                        : "absolute top-[7px] -left-[4.5px] size-[9px] rounded-full border-2 border-canvas bg-line-strong"
                    }
                  />
                  <p className={step.person ? "text-[16px] font-medium text-ink" : "text-[15.5px] text-ink-2"}>
                    <span className={`mr-2 text-[12.5px] font-medium ${step.person ? "text-brand-ink" : "text-ink-3"}`}>{step.who}</span>
                    {step.what}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* The idea the product is built on, set as type rather than cards. */}
      <section aria-labelledby="principles-title" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <Reveal>
            <SectionLabel n="05">Why you can trust it</SectionLabel>
            <h2 id="principles-title" className="sr-only">Why you can trust OpsWarden</h2>
          </Reveal>
          <ol className="mt-10">
            {PRINCIPLES.map((p, i) => (
              <Reveal
                as="li"
                key={p.verb}
                delay={[0, 60, 110][i]}
                className="grid gap-3 border-b border-line py-7 first:pt-0 last:border-b-0 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] md:items-end md:gap-10"
              >
                <p className="text-[40px] font-semibold leading-[1] tracking-[-0.035em] text-ink sm:text-[60px] lg:text-[72px]" style={{ paddingLeft: `${i * 6}%` }}>
                  {p.subject} <Em className={i === 2 ? "text-brand-ink" : "text-ink-2"}>{p.verb}</Em>
                </p>
                <p className="max-w-sm text-[15px] leading-relaxed text-ink-2 md:pb-2">{p.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Questions */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-24">
          <Reveal>
            <SectionLabel n="06">Questions</SectionLabel>
            <h2 id="faq-title" className="mt-6 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[46px]">
              What people <Em>ask first.</Em>
            </h2>
          </Reveal>
          <Reveal delay={60}>
            <div className="border-t border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="faq group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium text-ink">
                    {q}
                    <span aria-hidden className="chev inline-block font-mono text-[18px] leading-none text-ink-3">+</span>
                  </summary>
                  <p className="pb-5 text-[15px] leading-relaxed text-ink-2">{a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Close: a parcel on its way, the next delivery to check. */}
      <section className="px-5 pb-16 sm:px-6">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative isolate overflow-hidden rounded-[24px] bg-[#11151c] text-[#F3EEE3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/ships-out.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover object-[30%_50%] opacity-60" />
            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "linear-gradient(100deg, rgb(13 16 21 / 0.95) 30%, rgb(13 16 21 / 0.55))" }} />
            <div className="flex flex-col gap-8 px-8 py-16 sm:px-12 sm:py-20 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <p className="text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[54px]">
                  Try it on a <Em className="text-[#EE6A24]">real</Em> case.
                </p>
                <p className="mt-4 text-[15.5px] leading-relaxed text-[#F3EEE3]/70">
                  The demo workspace has sample suppliers, purchase orders and cases. Drop a document, watch it get matched, and
                  approve the letter.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <LandingCta className="h-11 px-5 text-[15px]" signup />
                <Link href="/how-it-works" className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-[#F3EEE3]/80 hover:text-[#F3EEE3]">
                  How it works
                  <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
