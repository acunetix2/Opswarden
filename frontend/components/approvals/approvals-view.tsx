"use client";

import { ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { PillTabs } from "@/components/ui/pill-tabs";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import { parseIso } from "@/lib/period";
import type { Approval, ApprovalStatus, Severity } from "@/lib/types";
import { useAllFindingsQuery, useApprovalsQuery, useSettingsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { ApprovalCard, type ApprovalContext } from "./approval-card";
import { Donut, LegendBar, StackedBar, SummaryTile, TickGauge, type Segment } from "./approval-summary";

type Tab = "pending" | "approved" | "history" | "all";
type Sort = "oldest" | "newest" | "value";

const HISTORY: ApprovalStatus[] = ["executed", "rejected", "failed", "expired"];
const SEVERITY_RANK: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const SUPPLIER_COLORS = ["var(--color-ink)", "var(--color-brand)", "var(--color-info)", "var(--color-warning)", "var(--color-ink-3)"];

function matchesTab(a: Approval, tab: Tab) {
  if (tab === "all") return true;
  if (tab === "history") return HISTORY.includes(a.status);
  return a.status === tab;
}

export function ApprovalsView() {
  const { workspace, can, role } = useWorkspace();
  const [tab, setTab] = useState<Tab>("pending");
  const [sort, setSort] = useState<Sort>("oldest");
  const [search, setSearch] = useState("");
  const { data, error, isLoading, refetch } = useApprovalsQuery({ workspaceId: workspace.id });
  const { data: findings } = useAllFindingsQuery(workspace.id);
  const { data: settings } = useSettingsQuery(workspace.id);

  // Workspace policy can restrict approvals to admins (re-checked server-side).
  const policyAllows = role !== "reviewer" || settings?.reviewers_can_approve !== false;
  const canDecide = can("decide_approval") && policyAllows;
  const all = useMemo(() => data ?? [], [data]);

  // Per-case money and severity from the findings register, so each card shows what's at stake.
  const { contexts, mainCurrency } = useMemo(() => {
    const live = (findings ?? []).filter((f) => f.status !== "dismissed");
    const totals = new Map<string, number>();
    live.forEach((f) => f.currency && f.impact_amount && totals.set(f.currency, (totals.get(f.currency) ?? 0) + Math.abs(Number(f.impact_amount))));
    const main = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const byCase = new Map<string, { sum: number; currency: string | null; top: Severity | null; bySeverity: Partial<Record<Severity, number>>; count: number }>();
    live.forEach((f) => {
      const c = byCase.get(f.case_id) ?? { sum: 0, currency: null, top: null, bySeverity: {}, count: 0 };
      c.count += 1;
      c.bySeverity[f.severity] = (c.bySeverity[f.severity] ?? 0) + 1;
      if (!c.top || SEVERITY_RANK[f.severity] > SEVERITY_RANK[c.top]) c.top = f.severity;
      if (f.impact_amount && f.currency && (!c.currency || c.currency === f.currency)) {
        c.currency = f.currency;
        c.sum += Math.abs(Number(f.impact_amount));
      }
      byCase.set(f.case_id, c);
    });
    const contexts = new Map<string, ApprovalContext & { value: number; currency: string | null }>();
    byCase.forEach((c, id) =>
      contexts.set(id, {
        amount: c.currency && c.sum ? formatMoney(c.sum.toFixed(2), c.currency) : null,
        topSeverity: c.top,
        bySeverity: c.bySeverity,
        findingCount: c.count,
        value: c.sum,
        currency: c.currency,
      }),
    );
    return { contexts, mainCurrency: main };
  }, [findings]);

  const counts = {
    pending: all.filter((a) => a.status === "pending").length,
    approved: all.filter((a) => a.status === "approved").length,
    history: all.filter((a) => HISTORY.includes(a.status)).length,
    all: all.length,
  };

  const summary = useMemo(() => {
    const segments: Segment[] = [
      { label: "Waiting", value: counts.pending, color: "var(--color-brand)" },
      { label: "Signed or sent", value: all.filter((a) => a.status === "approved" || a.status === "executed").length, color: "var(--color-success)" },
      { label: "Rejected or void", value: all.filter((a) => ["rejected", "expired", "failed"].includes(a.status)).length, color: "var(--color-ink-3)" },
    ];
    // Value waiting for sign-off, split by supplier (main currency only; currencies are never added).
    const bySupplier = new Map<string, number>();
    all
      .filter((a) => a.status === "pending")
      .forEach((a) => {
        const c = contexts.get(a.case_id);
        if (c && c.currency === mainCurrency && c.value) bySupplier.set(a.supplier_name ?? "Other", (bySupplier.get(a.supplier_name ?? "Other") ?? 0) + c.value);
      });
    const suppliers = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]);
    const top = suppliers.slice(0, 4);
    const rest = suppliers.slice(4).reduce((s, [, v]) => s + v, 0);
    const supplierSegments: Segment[] = [...top, ...(rest ? [["Others", rest] as [string, number]] : [])].map(([label, value], i) => ({
      label,
      value,
      color: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]!,
    }));
    const weekAgo = Date.now() - 7 * 86_400_000;
    const decidedWeek = all.filter((a) => a.reviewed_at && parseIso(a.reviewed_at).getTime() >= weekAgo).length;
    return {
      segments,
      supplierSegments,
      pendingValue: supplierSegments.reduce((s, x) => s + x.value, 0),
      decidedWeek,
    };
  }, [all, contexts, mainCurrency, counts.pending]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter(
      (a) =>
        matchesTab(a, tab) &&
        (!q || [a.subject, a.case_number, a.case_title, a.supplier_name, a.requested_by_name].some((s) => (s ?? "").toLowerCase().includes(q))),
    );
    const t = (a: Approval) => parseIso(a.created_at).getTime();
    if (sort === "oldest") list.sort((a, b) => t(a) - t(b));
    else if (sort === "newest") list.sort((a, b) => t(b) - t(a));
    else list.sort((a, b) => (contexts.get(b.case_id)?.value ?? 0) - (contexts.get(a.case_id)?.value ?? 0));
    return list;
  }, [all, tab, search, sort, contexts]);

  const SORT_LABEL: Record<Sort, string> = { oldest: "Waiting longest", newest: "Newest first", value: "Highest value" };
  const nextSort: Record<Sort, Sort> = { oldest: "newest", newest: "value", value: "oldest" };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Review and sign off supplier letters. Nothing leaves OpsWarden until it is approved here."
        actions={
          counts.pending && canDecide ? (
            <Button
              variant="secondary"
              className="text-brand-ink"
              onClick={() => {
                setTab("pending");
                setSort("oldest");
                setSearch("");
                window.setTimeout(() => document.querySelector("[data-approval-list] article")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
              }}
            >
              Review oldest first
            </Button>
          ) : null
        }
        tabs={
          <PillTabs
            label="Approval status"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "pending", label: "Pending", count: counts.pending },
              { value: "approved", label: "Signed", count: counts.approved },
              { value: "history", label: "History", count: counts.history },
              { value: "all", label: "All", count: counts.all },
            ]}
          />
        }
      />

      {settings && !settings.email_configured ? (
        <Notice tone="info">Email sending isn&apos;t connected, so approved letters are exported for you to send.</Notice>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SummaryTile title="Approval status">
          {data ? (
            <div className="flex items-center gap-4">
              <Donut
                segments={summary.segments}
                caption={`${counts.pending} waiting of ${counts.all}`}
                center={
                  <span>
                    <span className="block text-[20px] font-semibold leading-none text-ink tabular">{counts.pending}</span>
                    <span className="text-[10.5px] text-ink-3">waiting</span>
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <ul className="space-y-2">
                  {summary.segments.map((s) => (
                    <LegendBar key={s.label} segment={s} total={counts.all} />
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-ink-3">
                  {canDecide ? `${counts.pending} ${counts.pending === 1 ? "needs" : "need"} your signature` : "Signed by reviewers and admins"}
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-24" />
          )}
        </SummaryTile>

        <SummaryTile title="Value awaiting sign-off">
          {findings ? (
            <>
              <p className="text-[24px] font-semibold leading-none text-ink tabular">
                {mainCurrency && summary.pendingValue ? formatMoney(summary.pendingValue.toFixed(2), mainCurrency) : "\u2014"}
              </p>
              <p className="mt-1 text-[12px] text-ink-3">
                {summary.pendingValue ? "Disputed value on cases with a letter waiting, by supplier" : "No money impact on waiting letters"}
              </p>
              <div className="mt-auto pt-3">{summary.supplierSegments.length ? <StackedBar segments={summary.supplierSegments} /> : null}</div>
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </SummaryTile>

        <SummaryTile title="Last 7 days" className="md:col-span-2 xl:col-span-1">
          <div className="flex items-end justify-between text-[12.5px]">
            <span>
              <span className="block text-ink-3">Decided</span>
              <span className="text-[16px] font-semibold text-ink tabular">{summary.decidedWeek}</span>
            </span>
            <span className="text-right">
              <span className="block text-ink-3">Still waiting</span>
              <span className="text-[16px] font-semibold text-ink tabular">{counts.pending}</span>
            </span>
          </div>
          <TickGauge value={summary.decidedWeek} max={summary.decidedWeek + counts.pending} label="cleared" />
        </SummaryTile>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="approval-search" className="sr-only">Search approvals</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            id="approval-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by supplier, case or subject"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 hover:border-line-strong focus-visible:border-ink-3 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.18)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setSort(nextSort[sort])}
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] text-ink-2 hover:bg-surface-muted hover:text-ink"
          aria-label={`Sort: ${SORT_LABEL[sort]}. Click to change.`}
        >
          <ArrowUpDown className="size-4" aria-hidden />
          {SORT_LABEL[sort]}
        </button>
        <p className="ml-auto text-[12.5px] text-ink-3" role="status">
          {visible.length} {visible.length === 1 ? "letter" : "letters"}
        </p>
      </div>

      <div data-approval-list className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-72 w-full rounded-[12px]" />
        ) : error && !data ? (
          <Card>
            <ErrorState error={error} onRetry={refetch} />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              title={
                search
                  ? "No letters match your search"
                  : tab === "pending"
                    ? "Nothing waiting for a signature"
                    : tab === "approved"
                      ? "No signed letters waiting to be sent"
                      : "No past decisions yet"
              }
              description={!search && tab === "pending" ? "Letters appear here after someone requests approval from a case." : undefined}
            />
          </Card>
        ) : (
          visible.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              context={contexts.get(a.case_id)}
              canDecide={canDecide}
              canExecute={can("execute_action") && policyAllows}
              emailConfigured={settings?.email_configured ?? false}
              sendOnApproval={settings?.send_on_approval ?? true}
            />
          ))
        )}
      </div>
    </div>
  );
}
