"use client";

import { cn } from "@/lib/cn";

interface PillTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Rounded filter tabs with counts, e.g. Pending (3) · Approved (0). */
export function PillTabs<T extends string>({ label, tabs, value, onChange, className }: { label: string; tabs: PillTab<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              active ? "border-ink bg-ink text-canvas" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className={cn("tabular", active ? "text-canvas/75" : "text-ink-3")}>({t.count})</span> : null}
          </button>
        );
      })}
    </div>
  );
}
