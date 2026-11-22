"use client";

import { Check, Mail, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AnalysisStages } from "@/components/cases/detail/analysis-stages";
import { cn } from "@/lib/cn";
import type { CaseStreamEvent } from "@/lib/types";

import { InvoicePaper, PurchaseOrderPaper, ReceiptPaper } from "./paper-docs";

/*
 * The in-app analysis view, replayed. This is the same AnalysisStages component
 * a case page shows while the agent runs, fed a scripted event stream for the
 * sample case. It plays when scrolled into view, pauses off screen, and under
 * reduced motion shows the finished run without playing.
 */

type Step = { at: number; type: string; payload?: Record<string, unknown>; doc?: number };

// Milliseconds from the start of the run. Paced so each stage reads before the next.
const SCRIPT: Step[] = [
  { at: 0, type: "comparison.started" },
  { at: 300, type: "document.extraction.started", payload: { document_id: "po" }, doc: 0 },
  { at: 700, type: "document.extraction.started", payload: { document_id: "dr" }, doc: 1 },
  { at: 1100, type: "document.extraction.started", payload: { document_id: "inv" }, doc: 2 },
  { at: 1500, type: "document.extraction.completed", payload: { document_id: "po" } },
  { at: 1900, type: "document.extraction.completed", payload: { document_id: "dr" } },
  { at: 2300, type: "document.extraction.completed", payload: { document_id: "inv" } },
  { at: 2900, type: "register.supplier_added", payload: { name: "Northstar Office Supplies" } },
  { at: 3200, type: "register.purchase_order_added", payload: { po_number: "PO-1048" } },
  { at: 4400, type: "comparison.completed", payload: { finding_count: 1 } },
  { at: 5500, type: "investigation.completed", payload: { status: "ready_for_approval" } },
  { at: 6800, type: "automation.completed", payload: { actions: ["letter_queued", "reviewers_emailed"] } },
];
const RUN_MS = 6800;
const HOLD_MS = 4200;
const T0 = Date.parse("2026-11-05T09:12:00Z");

function eventsUntil(ms: number): CaseStreamEvent[] {
  return SCRIPT.filter((s) => s.at <= ms).map((s) => ({
    type: s.type,
    case_id: "sample",
    actor_type: "system",
    created_at: new Date(T0 + s.at).toISOString(),
    payload: (s.payload ?? {}) as Record<string, string | number>,
    case_status: "processing",
  }));
}

const DOCS = [
  { label: "Purchase order", Paper: PurchaseOrderPaper, readAt: 1500 },
  { label: "Delivery receipt", Paper: ReceiptPaper, readAt: 1900 },
  { label: "Invoice", Paper: InvoicePaper, readAt: 2300 },
];

export function AgentRunDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [ms, setMs] = useState(RUN_MS); // server render and reduced motion: the finished run
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A 100ms clock is plenty: the motion itself is CSS transitions on the compositor.
    let start = performance.now();
    setMs(0);
    const id = window.setInterval(() => {
      let t = performance.now() - start;
      if (t > RUN_MS + HOLD_MS) {
        start = performance.now(); // replay
        t = 0;
      }
      setMs(t);
    }, 100);
    return () => window.clearInterval(id);
  }, [visible]);

  const events = eventsUntil(ms);
  const done = ms >= RUN_MS;
  const matched = ms >= 4400;

  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
      {/* The three documents being read: each lifts and gets a tick as its extraction completes. */}
      <div className="relative mx-auto h-[360px] w-full max-w-[26rem] sm:h-[400px]" aria-hidden>
        {DOCS.map(({ label, Paper, readAt }, i) => {
          const reading = ms >= readAt - 1200 && ms < readAt;
          const read = ms >= readAt;
          return (
            <div
              key={label}
              className="absolute w-[78%] transition-transform duration-500"
              style={{
                left: `${[0, 11, 22][i]}%`,
                top: `${[0, 22, 44][i]}%`,
                zIndex: i,
                transform: `rotate(${[-5, 2, -1.5][i]}deg) translateY(${reading ? -10 : 0}px)`,
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              <Paper />
              <span
                className={cn(
                  "absolute -top-2.5 -right-2.5 grid size-7 place-items-center rounded-full bg-success text-[#fff] shadow-[0_4px_12px_rgb(0_0_0/0.25)] transition-[opacity,transform] duration-300",
                  read ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
                style={{ transitionTimingFunction: "var(--ease-out)" }}
              >
                <Check className="size-4" strokeWidth={3} />
              </span>
              {reading ? <span className="ow-scanline pointer-events-none absolute inset-x-0 top-0 h-10 rounded-[6px]" /> : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <AnalysisStages events={events} live={!done} />
        {/* What the run produced: appears once the match is done. */}
        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          <Outcome show={matched} delay={0}>
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">Billed for 10 units not delivered</span>
              <span className="mt-0.5 block font-mono text-[12px] text-ink-2 tabular">10 × $12.00 = $120.00</span>
            </span>
          </Outcome>
          <Outcome show={done} delay={80}>
            <Mail className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">Letter waiting for approval</span>
              <span className="mt-0.5 block text-[12px] text-ink-2">Approver emailed. Nothing sent yet.</span>
            </span>
          </Outcome>
        </div>
      </div>
    </div>
  );
}

function Outcome({ show, delay, children }: { show: boolean; delay: number; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 transition-[opacity,transform] duration-300",
        show ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
      )}
      style={{ transitionTimingFunction: "var(--ease-out)", transitionDelay: show ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
