"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SeverityBadge } from "@/components/status/status-badges";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Term } from "@/components/ui/term";
import { formatMoney } from "@/lib/format";
import { inPeriod, lastMonths, monthKey, PERIOD_OPTIONS, periodPhrase, trendMonths, type Period } from "@/lib/period";
import { useAllFindingsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { BarList, MonthlyBars, Stat } from "./bar-list";

const amount = (v: string | null) => Math.abs(Number(v ?? 0));

/** Money still in dispute: findings that are open, confirmed or awaiting review (not dismissed). */
export function ExposureView() {
  const { workspace } = useWorkspace();
  const [period, setPeriod] = useState<Period>("all");
  const { data, error, isLoading, refetch } = useAllFindingsQuery(workspace.id);

  const model = useMemo(() => {
    const priced = (data ?? []).filter((f) => f.status !== "dismissed" && f.impact_amount && f.currency && Number(f.impact_amount) !== 0);
    const live = priced.filter((f) => inPeriod(f.created_at, period));
    const byCurrency = new Map<string, number>();
    live.forEach((f) => byCurrency.set(f.currency!, (byCurrency.get(f.currency!) ?? 0) + amount(f.impact_amount)));
    const currencies = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
    const main = currencies[0]?.[0];
    const inMain = live.filter((f) => f.currency === main);
    const bySupplier = new Map<string, number>();
    inMain.forEach((f) => {
      const k = f.supplier_name || "Unnamed supplier";
      bySupplier.set(k, (bySupplier.get(k) ?? 0) + amount(f.impact_amount));
    });

    const months = lastMonths(trendMonths(period));
    const idx = new Map(months.map((m, i) => [m.key, i]));
    const opened = months.map(() => 0);
    priced
      .filter((f) => f.currency === main)
      .forEach((f) => {
        const i = idx.get(monthKey(f.created_at));
        if (i !== undefined) opened[i]! += amount(f.impact_amount);
      });

    return {
      live,
      currencies,
      main,
      suppliers: [...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      top: [...inMain].sort((a, b) => amount(b.impact_amount) - amount(a.impact_amount)).slice(0, 10),
      confirmed: inMain.filter((f) => f.status === "confirmed").reduce((s, f) => s + amount(f.impact_amount), 0),
      undecided: inMain.filter((f) => f.status === "open" || f.status === "needs_review").reduce((s, f) => s + amount(f.impact_amount), 0),
      months,
      opened,
    };
  }, [data, period]);

  const money = (n: number, c: string) => formatMoney(n.toFixed(2), c);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insights"
        title="Exposure"
        description={
          <>
            <Term term="exposure">Money still in dispute</Term> across all cases, for findings identified in {periodPhrase(period)}. Dismissed
            findings are excluded. Different currencies are never added together.
          </>
        }
        actions={<Segmented label="Date range" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />}
      />

      {error && !data ? (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : model.live.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No value in dispute"
            description={
              period === "all"
                ? "When analysis finds a price or quantity mismatch with a money impact, it shows up here."
                : "Nothing with a money impact was identified in this range. Try a longer range."
            }
          />
        </Card>
      ) : model.main ? (
        <>
          <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {model.currencies.map(([c, n]) => (
              <Stat key={c} label={`In dispute, ${c}`} value={money(n, c)} />
            ))}
            <Stat label={`Confirmed, ${model.main}`} value={money(model.confirmed, model.main)} hint="A reviewer agreed these are real" />
            <Stat
              label={`Awaiting decision, ${model.main}`}
              value={money(model.undecided, model.main)}
              hint={
                <Link href="/app/findings" className="text-brand-ink underline-offset-2 hover:underline">
                  Review them in Findings
                </Link>
              }
            />
          </section>

          <Card>
            <CardHeader index="01" title="New exposure per month" description={`Value of findings identified each month, in ${model.main}. Dismissed findings excluded.`} />
            <MonthlyBars
              months={model.months}
              series={[{ name: `Identified (${model.main})`, tone: "brand", values: model.opened, format: (n) => money(n, model.main!) }]}
            />
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader index="02" title="By supplier" description={`Largest amounts in dispute, in ${model.main}.`} />
              <BarList rows={model.suppliers.map(([name, n]) => ({ key: name, label: name, value: n, display: money(n, model.main!) }))} />
            </Card>
            <Card>
              <CardHeader index="03" title="Biggest single findings" description="Click one to open its case." />
              <ul className="divide-y divide-line">
                {model.top.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/app/investigations/${f.case_id}#finding-${f.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted/70"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{f.title}</span>
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {f.case_number} · {f.supplier_name ?? "No supplier"}
                        </span>
                      </span>
                      <SeverityBadge severity={f.severity} />
                      <span className="figure w-28 shrink-0 text-right text-[13px] text-ink">{money(amount(f.impact_amount), f.currency!)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
