import type { ReactNode } from "react";

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** Text shown at the right end of the row. Defaults to the value. */
  display?: ReactNode;
  tone?: "brand" | "ink" | "success" | "danger" | "warning";
}

const TONE: Record<NonNullable<BarRow["tone"]>, string> = {
  brand: "bg-brand",
  ink: "bg-ink",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
};

/** Horizontal ranked bars. Bars are scaled to the largest row in the list. */
export function BarList({ rows, empty = "Nothing to show yet." }: { rows: BarRow[]; empty?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return <p className="px-5 py-8 text-center text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-4 px-5 py-3">
          <span className="w-40 shrink-0 truncate text-[13px] text-ink sm:w-52">{r.label}</span>
          <span aria-hidden className="h-2 flex-1 bg-surface-sunken">
            <span
              className={`block h-full ${TONE[r.tone ?? "brand"]}`}
              style={{ width: `${max ? Math.max(3, Math.round((r.value / max) * 100)) : 0}%` }}
            />
          </span>
          <span className="figure w-28 shrink-0 text-right text-[13px] text-ink">{r.display ?? r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export interface TrendSeries {
  name: string;
  tone: NonNullable<BarRow["tone"]>;
  values: number[];
  format?: (n: number) => string;
}

/** Vertical bars per month, one bar per series side by side. Each series is scaled to its own peak. */
export function MonthlyBars({ months, series, empty = "No activity in this range." }: { months: { key: string; label: string }[]; series: TrendSeries[]; empty?: string }) {
  const peaks = series.map((s) => Math.max(...s.values, 0));
  if (peaks.every((p) => p === 0)) return <p className="px-5 py-8 text-center text-[13px] text-ink-3">{empty}</p>;
  return (
    <div className="px-5 py-4">
      <ul className="mb-3 flex flex-wrap gap-4" aria-hidden>
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className={`size-2.5 ${TONE[s.tone]}`} />
            {s.name}
          </li>
        ))}
      </ul>
      <table className="block w-full">
        <caption className="sr-only">Monthly trend: {series.map((s) => s.name).join(", ")}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Month</th>
            {series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}
          </tr>
        </thead>
        <tbody className="flex h-40 items-end gap-1 border-b border-line-strong sm:gap-2">
          {months.map((m, mi) => (
            <tr key={m.key} className="flex h-full flex-1 items-end justify-center gap-0.5">
              <th scope="row" className="sr-only">{m.label}</th>
              {series.map((s, si) => {
                const v = s.values[mi] ?? 0;
                const peak = peaks[si] ?? 0;
                const text = s.format ? s.format(v) : String(v);
                return (
                  <td key={s.name} className="flex h-full max-w-5 flex-1 items-end" title={`${m.label}: ${text} ${s.name.toLowerCase()}`}>
                    <span className="sr-only">{text}</span>
                    <span aria-hidden className={`block w-full ${TONE[s.tone]}`} style={{ height: peak ? `${Math.max(v ? 3 : 0, (v / peak) * 100)}%` : 0 }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden className="mt-1.5 flex gap-1 sm:gap-2">
        {months.map((m) => (
          <span key={m.key} className="flex-1 text-center font-mono text-[10.5px] text-ink-3">{m.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Compact figure block used at the top of insight pages. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight text-ink tabular">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}