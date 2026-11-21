"use client";

import Link from "next/link";
import { Check, Download, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { FindingStatusBadge, SeverityBadge } from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Term } from "@/components/ui/term";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { downloadCsv, fileStamp, toCsv } from "@/lib/csv";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { FindingDecision, Severity, WorkspaceFinding } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useAllFindingsQuery, useReviewFindingMutation } from "@/store/api";
import { useToast, useWorkspace } from "@/store/hooks";

type StatusFilter = "" | "undecided" | "open" | "needs_review" | "confirmed" | "dismissed";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "undecided", label: "Needs a decision" },
  { value: "open", label: "Open" },
  { value: "needs_review", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const isUndecided = (f: WorkspaceFinding) => f.status === "open" || f.status === "needs_review";

function impact(f: WorkspaceFinding) {
  return f.impact_amount && f.currency ? formatMoney(f.impact_amount, f.currency) : "\u2014";
}

export function FindingsView() {
  const { workspace, can } = useWorkspace();
  const toast = useToast();
  const canReview = can("review_finding");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(search.trim());
  const { data, error, isLoading, refetch } = useAllFindingsQuery(workspace.id);
  const [review] = useReviewFindingMutation();

  const rows = useMemo(() => {
    const q = debounced.toLowerCase();
    return (data ?? []).filter((f) => {
      if (status === "undecided" ? !isUndecided(f) : status && f.status !== status) return false;
      if (severity && f.severity !== severity) return false;
      if (!q) return true;
      return [f.title, f.case_number, f.rule_id, f.supplier_name ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [data, status, severity, debounced]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const byCurrency = new Map<string, number>();
    all
      .filter((f) => f.status !== "dismissed" && f.impact_amount && f.currency)
      .forEach((f) => byCurrency.set(f.currency!, (byCurrency.get(f.currency!) ?? 0) + Math.abs(Number(f.impact_amount))));
    return {
      total: all.length,
      undecided: all.filter(isUndecided).length,
      confirmed: all.filter((f) => f.status === "confirmed").length,
      exposure: [...byCurrency.entries()].map(([c, n]) => formatMoney(n.toFixed(2), c)).join(" + "),
    };
  }, [data]);

  const selectedRows = rows.filter((f) => selected.has(f.id));
  const allVisibleSelected = rows.length > 0 && rows.every((f) => selected.has(f.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map((f) => f.id)));
  }

  async function bulk(decision: FindingDecision, comment?: string) {
    const targets = selectedRows;
    if (!targets.length) return;
    setBusy(true);
    const results = await Promise.allSettled(
      targets.map((f) => review({ caseId: f.case_id, findingId: f.id, decision, comment }).unwrap()),
    );
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const ok = targets.length - failed.length;
    const verb = decision === "confirm" ? "confirmed" : decision === "dismiss" ? "dismissed" : "reopened";
    if (ok) toast("success", `${ok} ${ok === 1 ? "finding" : "findings"} ${verb}`);
    if (failed.length) toast("danger", `${failed.length} couldn't be updated`, toAppError(failed[0]!.reason).message);
    setSelected(new Set());
  }

  function exportCsv() {
    const csv = toCsv(rows, [
      { header: "Case", value: (f) => f.case_number },
      { header: "Case title", value: (f) => f.case_title },
      { header: "Supplier", value: (f) => f.supplier_name },
      { header: "Finding", value: (f) => f.title },
      { header: "Rule", value: (f) => f.rule_id },
      { header: "Type", value: (f) => f.finding_type },
      { header: "Severity", value: (f) => f.severity },
      { header: "Status", value: (f) => f.status },
      { header: "Impact", value: (f) => f.impact_amount },
      { header: "Currency", value: (f) => f.currency },
      { header: "Identified", value: (f) => f.created_at },
    ]);
    downloadCsv(`opswarden-findings-${fileStamp()}.csv`, csv);
  }

  const filtered = Boolean(debounced || status || severity);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="All findings"
        description={
          data ? (
            <span className="block space-y-1">
              <span className="block">
                {stats.undecided ? (
                  <button type="button" onClick={() => setStatus("undecided")} className="font-medium text-brand-ink underline-offset-2 hover:underline">
                    {stats.undecided} {stats.undecided === 1 ? "finding needs" : "findings need"} a decision
                  </button>
                ) : (
                  "Every finding has been reviewed."
                )}{" "}
                {stats.total} in total, {stats.confirmed} confirmed.
              </span>
              <span className="block text-ink-3">
                {stats.exposure ? (
                  <>
                    <Term term="exposure">Value at stake</Term>: {stats.exposure}.
                  </>
                ) : (
                  "No monetary impact recorded."
                )}{" "}
                Click a row to open its case.
              </span>
            </span>
          ) : (
            "Every discrepancy identified across all investigations."
          )
        }
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length} icon={<Download className="size-4" aria-hidden />}>
            Export CSV
          </Button>
        }
      />

      <Card>
        <div className="grid gap-4 border-b border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
          <div className="relative">
            <label htmlFor="finding-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="finding-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, case number, supplier or rule"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label htmlFor="status-filter" className="label">Status</label>
            <Select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="mt-1 h-9 w-44 text-[13px]">
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="severity-filter" className="label">
              <Term term="severity">Severity</Term>
            </label>
            <Select id="severity-filter" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} className="mt-1 h-9 w-36 text-[13px]">
              <option value="">Any severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
          </div>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              icon={<X className="size-3.5" aria-hidden />}
              onClick={() => {
                setSearch("");
                setStatus("");
                setSeverity("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {canReview && selectedRows.length ? (
          <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-ink bg-brand-tint px-5 py-2.5">
            <span className="mr-auto text-[13px] font-medium text-ink">
              {selectedRows.length} selected
              <button type="button" onClick={() => setSelected(new Set())} className="ml-3 text-[12.5px] font-normal text-ink-2 underline-offset-2 hover:underline">
                Clear selection
              </button>
            </span>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => bulk("confirm")} icon={<Check className="size-3.5" aria-hidden />}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDismissOpen(true)}>
              Dismiss...
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => bulk("reopen")} icon={<RotateCcw className="size-3.5" aria-hidden />}>
              Reopen
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <SkeletonRows rows={8} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No findings match" : "No findings yet"}
            description={data?.length ? "Try another filter, or clear them." : "Findings appear after a case is analyzed."}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">Findings</caption>
                <thead>
                  <tr className="border-b border-line bg-canvas/60">
                    {canReview ? (
                      <th scope="col" className="w-10 py-2.5 pl-5">
                        <input
                          type="checkbox"
                          aria-label={allVisibleSelected ? "Deselect all" : "Select all visible findings"}
                          checked={allVisibleSelected}
                          onChange={toggleAll}
                          className="size-4 accent-ink"
                        />
                      </th>
                    ) : null}
                    <th scope="col" className="label px-5 py-2.5 font-medium">Finding</th>
                    <th scope="col" className="label px-3 py-2.5 font-medium">Case</th>
                    <th scope="col" className="label px-3 py-2.5 font-medium">Severity</th>
                    <th scope="col" className="label px-3 py-2.5 text-right font-medium">Impact</th>
                    <th scope="col" className="label px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="label px-5 py-2.5 text-right font-medium">Identified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((f) => (
                    <tr key={f.id} className={cn("group relative transition-colors hover:bg-surface-muted/70", selected.has(f.id) && "bg-brand-tint/60")}>
                      {canReview ? (
                        <td className="relative z-10 py-3.5 pl-5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${f.title}`}
                            checked={selected.has(f.id)}
                            onChange={() => toggle(f.id)}
                            className="size-4 accent-ink"
                          />
                        </td>
                      ) : null}
                      <td className="max-w-md px-5 py-3.5">
                        <Link
                          href={`/app/investigations/${f.case_id}#finding-${f.id}`}
                          className="block truncate text-[13.5px] font-medium text-ink before:absolute before:inset-0 group-hover:text-brand-ink"
                        >
                          {f.title}
                        </Link>
                        <span className="block font-mono text-[11px] text-ink-3">{f.rule_id}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="block font-mono text-[12.5px] text-ink-2">{f.case_number}</span>
                        <span className="block max-w-44 truncate text-[12px] text-ink-3">{f.supplier_name}</span>
                      </td>
                      <td className="px-3 py-3.5"><SeverityBadge severity={f.severity} /></td>
                      <td className="figure whitespace-nowrap px-3 py-3.5 text-right text-[13px] text-ink">{impact(f)}</td>
                      <td className="px-3 py-3.5"><FindingStatusBadge status={f.status} /></td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-[11.5px] text-ink-3">{formatDateTime(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {rows.map((f) => (
                <li key={f.id} className={cn("flex gap-3 px-4 py-3.5", selected.has(f.id) && "bg-brand-tint/60")}>
                  {canReview ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${f.title}`}
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="mt-1 size-4 shrink-0 accent-ink"
                    />
                  ) : null}
                  <Link href={`/app/investigations/${f.case_id}#finding-${f.id}`} className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={f.severity} />
                      <FindingStatusBadge status={f.status} />
                    </span>
                    <span className="mt-1.5 block text-[14px] font-medium text-ink">{f.title}</span>
                    <span className="mt-1 flex justify-between gap-3 text-[12px] text-ink-3">
                      <span className="truncate font-mono">{f.case_number} · {f.supplier_name ?? "No supplier"}</span>
                      <span className="figure shrink-0 text-ink">{impact(f)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="border-t border-line px-5 py-2.5 font-mono text-[11px] text-ink-3" role="status">
              {rows.length === 1 ? "1 finding" : `${rows.length} findings`}
              {filtered ? " match your filters" : ""}
              {canReview ? " · tick rows to confirm, dismiss or reopen several at once" : ""}
            </p>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={dismissOpen}
        title={`Dismiss ${selectedRows.length} ${selectedRows.length === 1 ? "finding" : "findings"}?`}
        description="Dismissed findings stay in the audit trail and are left out of summaries and supplier emails. You can reopen them later."
        confirmLabel="Dismiss"
        confirmVariant="danger"
        confirmDisabled={!reason.trim()}
        onClose={() => setDismissOpen(false)}
        onConfirm={async () => {
          await bulk("dismiss", reason.trim());
          setDismissOpen(false);
          setReason("");
        }}
      >
        <Field label="Reason" htmlFor="bulk-dismiss-reason" required hint="Required. The same reason is recorded on each finding.">
          <Textarea id="bulk-dismiss-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
