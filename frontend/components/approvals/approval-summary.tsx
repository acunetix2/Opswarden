import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Small titled tile used in the summary row above the approval queue. */
export function SummaryTile({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex flex-col rounded-[12px] border border-line bg-surface-muted/50 p-1.5", className)}>
      <h2 className="px-2.5 pt-1.5 pb-2 text-[13px] font-semibold text-ink">{title}</h2>
      <div className="flex flex-1 flex-col rounded-[9px] border border-line bg-surface p-3.5">{children}</div>
    </section>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart with a centre label. Segments are drawn with stroke-dasharray. */
export function Donut({ segments, center, caption }: { segments: Segment[]; center: ReactNode; caption?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 34;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative size-[96px] shrink-0">
      <svg viewBox="0 0 96 96" className="size-full -rotate-90" role="img" aria-label={caption}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-surface-sunken)" strokeWidth="12" />
        {total
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * c;
                const el = (
                  <circle
                    key={s.label}
                    cx="48"
                    cy="48"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="12"
                    strokeDasharray={`${Math.max(len - 1.5, 0)} ${c}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })
          : null}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">{center}</span>
    </div>
  );
}

/** Legend row: dot, label, count, and a thin bar showing its share. */
export function LegendBar({ segment, total }: { segment: Segment; total: number }) {
  const pct = total ? Math.round((segment.value / total) * 100) : 0;
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="flex items-center gap-1.5 text-ink-2">
          <span aria-hidden className="size-2 rounded-full" style={{ background: segment.color }} />
          {segment.label}
        </span>
        <span className="font-medium text-ink tabular">{segment.value}</span>
      </div>
      <span aria-hidden className="mt-1 block h-1 rounded-full bg-surface-sunken">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: segment.color }} />
      </span>
    </li>
  );
}

/** Horizontal stacked bar with labelled shares, e.g. value in dispute split by supplier. */
export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <ul className="grid grid-cols-3 gap-2">
        {segments.slice(0, 3).map((s) => (
          <li key={s.label} className="min-w-0">
            <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="mt-0.5 block pl-3.5 text-[11.5px] text-ink-3 tabular">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-3 flex h-2 gap-1">
        {segments.map((s) => (
          <span key={s.label} className="block h-full rounded-full" style={{ width: `${total ? (s.value / total) * 100 : 0}%`, background: s.color, minWidth: s.value ? 6 : 0 }} />
        ))}
      </div>
    </div>
  );
}

/** Semicircle of ticks; the first `value / max` share is filled. */
export function TickGauge({ value, max, label }: { value: number; max: number; label: string }) {
  const ticks = 22;
  const filled = max ? Math.round((value / max) * ticks) : 0;
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="relative mx-auto w-[150px]">
      <svg viewBox="0 0 150 84" className="w-full" role="img" aria-label={`${label}: ${pct}%`}>
        {Array.from({ length: ticks }, (_, i) => {
          const angle = Math.PI - (i / (ticks - 1)) * Math.PI;
          const x1 = 75 + Math.cos(angle) * 46;
          const y1 = 78 - Math.sin(angle) * 46;
          const x2 = 75 + Math.cos(angle) * 68;
          const y2 = 78 - Math.sin(angle) * 68;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth="5.5"
              strokeLinecap="round"
              stroke={i < filled ? "var(--color-ink)" : "var(--color-surface-sunken)"}
            />
          );
        })}
      </svg>
      <span className="absolute inset-x-0 bottom-1 text-center">
        <span className="block text-[20px] font-semibold leading-none text-ink tabular">{pct}%</span>
        <span className="text-[11px] text-ink-3">{label}</span>
      </span>
    </div>
  );
}
