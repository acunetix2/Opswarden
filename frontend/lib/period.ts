/** Date-range helpers for the Insights pages. All grouping is in the browser's local time. */

export type Period = "30" | "90" | "365" | "all";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
  { value: "all", label: "All time" },
];

export function parseIso(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

/** True when `iso` falls inside the period ending now. */
export function inPeriod(iso: string, period: Period, now = Date.now()): boolean {
  if (period === "all") return true;
  return parseIso(iso).getTime() >= now - Number(period) * 86_400_000;
}

export function monthKey(iso: string): string {
  const d = parseIso(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The last `count` calendar months, oldest first, e.g. [{ key: "2026-06", label: "Jun" }, ...]. */
export function lastMonths(count: number, now = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString(undefined, { month: "short" }),
    });
  }
  return out;
}

/** How many months of trend to show for a period. */
export function trendMonths(period: Period): number {
  return period === "30" ? 3 : period === "90" ? 6 : 12;
}

export function periodPhrase(period: Period): string {
  return period === "all" ? "all time" : period === "365" ? "the last 12 months" : `the last ${period} days`;
}
