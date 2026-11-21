"use client";

import { useMemo, useState } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { Term } from "@/components/ui/term";
import { CASE_STATUS_LABEL } from "@/lib/format";
import { inPeriod, lastMonths, monthKey, PERIOD_OPTIONS, periodPhrase, trendMonths, type Period } from "@/lib/period";
import type { CaseStatus, Severity } from "@/lib/types";
import { useAllFindingsQuery, useCasesQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { BarList, MonthlyBars, Stat, type BarRow } from "./bar-list";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
const SEVERITY_TONE: Record<Severity, BarRow["tone"]> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "ink",
  info: "ink",
};

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "-";
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function AnalyticsView() {
  const { workspace } = useWorkspace();
  const [period, setPeriod] = useState<Period>("90");
  const findings = useAllFindingsQuery(workspace.id);
  const cases = useCasesQuery({ workspaceId: workspace.id, include_archived: true });

  const stats = useMemo(() => {
    const f = (findings.data ?? []).filter((x) => inPeriod(x.created_at, period));
    const c = (cases.data ?? []).filter((x) => inPeriod(x.created_at, period));
    const reviewed = f.filter((x) => x.status === "confirmed" || x.status === "dismissed");
    const confirmed = f.filter((x) => x.status === "confirmed").length;
    const typeCounts = new Map<string, number>();
    f.forEach((x) => typeCounts.set(x.finding_type, (typeCounts.get(x.finding_type) ?? 0) + 1));
    const statusCounts = new Map<CaseStatus, number>();
    c.forEach((x) => statusCounts.set(x.status, (statusCounts.get(x.status) ?? 0) + 1));
    const supplierCounts = new Map<string, number>();
    f.filter((x) => x.status !== "dismissed").forEach((x) => {
      const k = x.supplier_name || "Unnamed supplier";
      supplierCounts.set(k, (supplierCounts.get(k) ?? 0) + 1);
    });

    // Trend always covers whole months, independent of the stat filter above.
    const months = lastMonths(trendMonths(period));
    const idx = new Map(months.map((m, i) => [m.key, i]));
    const opened = months.map(() => 0);
    const found = months.map(() => 0);
    const resolved = months.map(() => 0);
    (cases.data ?? []).forEach((x) => {
      const i = idx.get(monthKey(x.created_at));
      if (i !== undefined) opened[i]! += 1;
      const r = x.resolved_at ? idx.get(monthKey(x.resolved_at)) : undefined;
      if (r !== undefined) resolved[r]! += 1;
    });
    (findings.data ?? []).forEach((x) => {
      const i = idx.get(monthKey(x.created_at));
      if (i !== undefined) found[i]! += 1;
    });

    return {
      totalFindings: f.length,
      totalCases: c.length,
      resolved: c.filter((x) => x.status === "resolved").length,
      reviewed: reviewed.length,
      confirmed,
      bySeverity: SEVERITIES.map((s) => ({ s, n: f.filter((x) => x.severity === s).length })),
      types: [...typeCounts.entries()].sort((a, b) => b[1] - a[1]),
      statuses: [...statusCounts.entries()].sort((a, b) => b[1] - a[1]),
      suppliers: [...supplierCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      months,
      opened,
      found,
      resolvedTrend: resolved,
    };
  }, [findings.data, cases.data, period]);

  const loading = findings.isLoading || cases.isLoading;
  const error = findings.error ?? cases.error;
  const phrase = periodPhrase(period);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description={
          <>
            How investigations are going: what gets found, how much of it is real, and which suppliers cause the most trouble.
            Figures cover {phrase}, counted by when each case was opened or each <Term term="finding" /> was identified.
          </>
        }
        actions={<Segmented label="Date range" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />}
      />

      {error && !findings.data ? (
        <Card>
          <ErrorState
            error={error}
            onRetry={() => {
              void findings.refetch();
              void cases.refetch();
            }}
          />
        </Card>
      ) : null}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat label="Cases opened" value={stats.totalCases} hint={`${stats.resolved} of them resolved (${pct(stats.resolved, stats.totalCases)})`} />
            <Stat label="Findings" value={stats.totalFindings} hint={`Identified in ${phrase}`} />
            <Stat label="Reviewed" value={pct(stats.reviewed, stats.totalFindings)} hint={`${stats.reviewed} confirmed or dismissed by a person`} />
            <Stat label="Confirmed real" value={pct(stats.confirmed, stats.reviewed)} hint="Share of reviewed findings that were genuine" />
          </>
        )}
      </section>

      <Card>
        <CardHeader
          index="01"
          title="Monthly trend"
          description="Cases opened and resolved, and findings identified, per calendar month. Each colour is scaled to its own peak."
        />
        {loading ? (
          <Skeleton className="m-5 h-40" />
        ) : (
          <MonthlyBars
            months={stats.months}
            series={[
              { name: "Cases opened", tone: "ink", values: stats.opened },
              { name: "Cases resolved", tone: "success", values: stats.resolvedTrend },
              { name: "Findings", tone: "brand", values: stats.found },
            ]}
          />
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader index="02" title="Findings by severity" description={<>How serious the discrepancies are (<Term term="severity" />).</>} />
          <BarList
            empty="No findings in this range."
            rows={stats.bySeverity.filter((x) => x.n > 0).map(({ s, n }) => ({ key: s, label: titleCase(s), value: n, tone: SEVERITY_TONE[s] }))}
          />
        </Card>
        <Card>
          <CardHeader index="03" title="Findings by type" description="Which kinds of mismatch happen most." />
          <BarList empty="No findings in this range." rows={stats.types.slice(0, 8).map(([k, n]) => ({ key: k, label: titleCase(k), value: n }))} />
        </Card>
        <Card>
          <CardHeader index="04" title="Cases by status" description="Where the cases opened in this range are now." />
          <BarList
            empty="No cases in this range."
            rows={stats.statuses.map(([k, n]) => ({ key: k, label: CASE_STATUS_LABEL[k] ?? titleCase(k), value: n, tone: k === "resolved" ? "success" : "brand" }))}
          />
        </Card>
        <Card>
          <CardHeader index="05" title="Suppliers with most findings" description="Findings not dismissed, in this range. Candidates for a conversation about quality." />
          <BarList empty="No supplier has findings in this range." rows={stats.suppliers.map(([name, n]) => ({ key: name, label: name, value: n }))} />
        </Card>
      </div>
    </div>
  );
}
