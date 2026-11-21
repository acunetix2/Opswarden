"use client";

import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

const ORDERED = 50;
const INVOICED = 50;
const UNIT_PRICE = 12;

type Outcome = "short" | "match" | "over";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/**
 * Interactive three-way match. Drag "received" and watch the finding change.
 * Explains the product by letting visitors touch it, with the real rule
 * (invoiced - received) x unit price. Synthetic data, clearly labelled.
 *
 * The result panel crossfades only when the outcome category changes, with a
 * light blur so the two states read as one transformation. Numbers update
 * instantly (dragging is high-frequency, so they don't animate) and use
 * tabular figures so the layout never jitters.
 */
export function MatchDemo() {
  const sliderId = useId();
  const [received, setReceived] = useState(40);
  const outcome: Outcome = received < INVOICED ? "short" : received > ORDERED ? "over" : "match";
  const impact = Math.max(0, INVOICED - received) * UNIT_PRICE;

  const docs = [
    { code: "PO", name: "Purchase order", label: "Ordered", value: ORDERED, flag: false },
    { code: "DR", name: "Delivery receipt", label: "Received", value: received, flag: outcome !== "match" },
    { code: "INV", name: "Invoice", label: "Invoiced", value: INVOICED, flag: outcome === "short" },
  ];

  return (
    <figure className="m-0 overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04),0_24px_60px_-20px_rgb(17_17_17/0.25)]">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-ink-3">OW-2026-0042</span>
          <span className="truncate text-[13px] font-medium text-ink">Northstar Office Supplies · PO-1048</span>
        </span>
        <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] text-ink-3">Sample data</span>
      </figcaption>

      <div className="grid grid-cols-3 gap-2 p-4 sm:gap-3 sm:p-5">
        {docs.map((d) => (
          <div
            key={d.code}
            className={cn(
              "rounded-[12px] border px-3 py-3 transition-[border-color,background-color] duration-200 ease-out sm:px-4",
              d.flag ? "border-brand/45 bg-brand-tint/70" : "border-line bg-canvas/60",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="rounded-[6px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-2">{d.code}</span>
              <span className="hidden truncate text-[11px] text-ink-3 sm:block">{d.name}</span>
            </span>
            <span className="mt-3 block text-[11.5px] text-ink-3">{d.label}</span>
            <span className={cn("mt-0.5 block text-[30px] font-semibold leading-none tracking-tight tabular sm:text-[34px]", d.flag ? "text-brand-ink" : "text-ink")}>
              {d.value}
            </span>
          </div>
        ))}
      </div>

      <div className="px-5 pb-1">
        <label htmlFor={sliderId} className="flex items-baseline justify-between text-[12.5px]">
          <span className="font-medium text-ink">Try it: change what was delivered</span>
          <span className="text-ink-3 tabular">{received} units</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={30}
          max={60}
          step={1}
          value={received}
          onChange={(e) => setReceived(Number(e.target.value))}
          aria-valuetext={`${received} units received`}
          className="demo-range mt-2 w-full"
        />
      </div>

      {/* Outcome: the three states share one grid cell and crossfade. */}
      <div className="grid p-4 pt-3 sm:p-5 sm:pt-3" aria-live="polite">
        <Result active={outcome === "short"} tone="danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Invoiced for more than was delivered</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
              Invoice lists {INVOICED} units, receipt records {received}. Evidence: INV line 1 · DR line 1.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[20px] font-semibold leading-none text-ink tabular">{usd(impact)}</p>
            <p className="mt-1 text-[11px] text-ink-3 tabular">
              {INVOICED - received} × {usd(UNIT_PRICE)}
            </p>
          </div>
        </Result>
        <Result active={outcome === "match"} tone="success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">All three documents agree</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">Ordered, received and invoiced match. The invoice is clear to pay.</p>
          </div>
        </Result>
        <Result active={outcome === "over"} tone="warning">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">More delivered than ordered</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
              {received - ORDERED} extra units arrived. Flagged for a person to check before anyone accepts or returns them.
            </p>
          </div>
        </Result>
      </div>
    </figure>
  );
}

function Result({ active, tone, children }: { active: boolean; tone: "danger" | "success" | "warning"; children: ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        "demo-result col-start-1 row-start-1 flex items-start gap-3 rounded-[12px] border px-4 py-3",
        tone === "danger" && "border-danger/25 bg-danger-soft/50",
        tone === "success" && "border-success/25 bg-success-soft/60",
        tone === "warning" && "border-warning/30 bg-warning-soft/60",
      )}
      data-active={active || undefined}
    >
      {children}
    </div>
  );
}
