"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Download, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { downloadCsv, fileStamp, toCsv } from "@/lib/csv";
import { CASE_STATUS_LABEL } from "@/lib/format";
import type { Case, CaseStatus } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useCasesQuery, useMembersQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { CaseTable } from "./case-table";

const STATUSES = Object.keys(CASE_STATUS_LABEL) as CaseStatus[];
const STALE_DAYS = 7;
const CLOSED: CaseStatus[] = ["resolved", "archived"];

type Sort = "recent" | "oldest" | "findings" | "number";
const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Recent activity" },
  { value: "oldest", label: "Least recent activity" },
  { value: "findings", label: "Most open findings" },
  { value: "number", label: "Case number" },
];

interface SavedView {
  name: string;
  query: string;
}

function time(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
}

function sortCases(cases: Case[], sort: Sort): Case[] {
  const out = [...cases];
  if (sort === "oldest") out.sort((a, b) => time(a.updated_at) - time(b.updated_at));
  else if (sort === "findings") out.sort((a, b) => b.finding_count - a.finding_count);
  else if (sort === "number") out.sort((a, b) => a.case_number.localeCompare(b.case_number, undefined, { numeric: true }));
  else out.sort((a, b) => time(b.updated_at) - time(a.updated_at));
  return out;
}

export function InvestigationsView() {
  const router = useRouter();
  const params = useSearchParams();
  const { workspace, user, can } = useWorkspace();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const status = params.get("status") ?? "";
  const owner = params.get("owner") ?? "";
  const archived = params.get("archived") === "1";
  const stale = params.get("stale") === "1";
  const sort = (SORTS.some((s) => s.value === params.get("sort")) ? params.get("sort") : "recent") as Sort;
  const debounced = useDebounced(search.trim());

  const [savedViews, setSavedViews] = useLocalStorage<SavedView[]>(`ow-saved-views:${workspace.id}`, []);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  // Keep the global top-bar search in sync when it navigates here.
  useEffect(() => setSearch(params.get("search") ?? ""), [params]);

  const { data, error, isLoading, isFetching, refetch } = useCasesQuery({
    workspaceId: workspace.id,
    search: debounced || undefined,
    status: status || undefined,
    owner_id: owner || undefined,
    include_archived: archived || undefined,
  });
  const { data: members } = useMembersQuery(workspace.id);

  const rows = useMemo(() => {
    const cutoff = Date.now() - STALE_DAYS * 86_400_000;
    const list = (data ?? []).filter((c) => !stale || (!CLOSED.includes(c.status) && time(c.updated_at) < cutoff));
    return sortCases(list, sort);
  }, [data, stale, sort]);

  function replaceParams(next: URLSearchParams) {
    router.replace(`/app/investigations${next.toString() ? `?${next}` : ""}`);
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    replaceParams(next);
  }

  // Current view, without the default sort, so saved views stay short.
  const currentQuery = useMemo(() => {
    const q = new URLSearchParams(params.toString());
    if (debounced) q.set("search", debounced);
    else q.delete("search");
    if (q.get("sort") === "recent") q.delete("sort");
    return q.toString();
  }, [params, debounced]);

  const filtered = Boolean(debounced || status || owner || archived || stale);
  const canSave = Boolean(currentQuery) && !savedViews.some((v) => v.query === currentQuery);

  function saveView(e: FormEvent) {
    e.preventDefault();
    const name = viewName.trim();
    if (!name) return;
    setSavedViews([...savedViews.filter((v) => v.name !== name), { name, query: currentQuery }]);
    setNaming(false);
    setViewName("");
  }

  function exportCsv() {
    const csv = toCsv(rows, [
      { header: "Case", value: (c) => c.case_number },
      { header: "Title", value: (c) => c.title },
      { header: "Supplier", value: (c) => c.supplier_name },
      { header: "PO reference", value: (c) => c.supplier_reference },
      { header: "Status", value: (c) => CASE_STATUS_LABEL[c.status] ?? c.status },
      { header: "Open findings", value: (c) => c.finding_count },
      { header: "Owner", value: (c) => c.owner_name },
      { header: "Currency", value: (c) => c.currency },
      { header: "Opened", value: (c) => c.created_at },
      { header: "Updated", value: (c) => c.updated_at },
      { header: "Resolved", value: (c) => c.resolved_at },
    ]);
    downloadCsv(`opswarden-cases-${fileStamp()}.csv`, csv);
  }

  const quick: { key: string; label: string; active: boolean; toggle: () => void }[] = [
    { key: "mine", label: "My cases", active: owner === user.id, toggle: () => setParam("owner", owner === user.id ? "" : user.id) },
    {
      key: "review",
      label: "Needs review",
      active: status === "needs_review",
      toggle: () => setParam("status", status === "needs_review" ? "" : "needs_review"),
    },
    { key: "stale", label: `No activity in ${STALE_DAYS}+ days`, active: stale, toggle: () => setParam("stale", stale ? "" : "1") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Register"
        title="Investigations"
        description={
          data
            ? `${rows.length} procurement ${rows.length === 1 ? "case" : "cases"}${filtered ? " match" : " on file"}${archived ? ", including archived" : ""}. Open one to see where it is and what to do next.`
            : "Every procurement case in this workspace."
        }
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length} icon={<Download className="size-4" aria-hidden />}>
              Export CSV
            </Button>
            {can("create_case") ? (
              <ButtonLink href="/app/investigations/new" variant="accent" icon={<Plus className="size-4" aria-hidden />}>
                New investigation
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <span className="label mr-1">Quick filters</span>
          {quick.map((q) => (
            <button
              key={q.key}
              type="button"
              aria-pressed={q.active}
              onClick={q.toggle}
              className={cn(
                "pressable rounded-full border px-3 py-1 text-[12.5px]",
                q.active ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink",
              )}
            >
              {q.label}
            </button>
          ))}
          {savedViews.length ? <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" /> : null}
          {savedViews.map((v) => (
            <span
              key={v.name}
              className={cn(
                "inline-flex items-center overflow-hidden rounded-full border text-[12.5px]",
                v.query === currentQuery ? "border-brand-ink bg-brand-tint text-ink" : "border-line-strong text-ink-2",
              )}
            >
              <button type="button" onClick={() => replaceParams(new URLSearchParams(v.query))} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 hover:text-ink">
                <Bookmark className="size-3" aria-hidden />
                {v.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved view ${v.name}`}
                onClick={() => setSavedViews(savedViews.filter((s) => s.name !== v.name))}
                className="border-l border-line-strong px-1.5 py-1 text-ink-3 hover:text-danger"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <span className="ml-auto">
            {naming ? (
              <form onSubmit={saveView} className="flex items-center gap-1.5">
                <label htmlFor="view-name" className="sr-only">Name this view</label>
                <input
                  id="view-name"
                  autoFocus
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
                  placeholder="Name this view"
                  maxLength={40}
                  className="h-8 w-40 border-0 border-b border-line-strong bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
                />
                <Button type="submit" size="sm" disabled={!viewName.trim()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
              </form>
            ) : canSave ? (
              <Button size="sm" variant="ghost" icon={<Bookmark className="size-3.5" aria-hidden />} onClick={() => setNaming(true)}>
                Save this view
              </Button>
            ) : null}
          </span>
        </div>

        <div className="grid gap-4 border-b border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="relative">
            <label htmlFor="case-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="case-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => setParam("search", search.trim())}
              placeholder="Supplier, reference, title, or case ID"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="status-filter" className="label">Status</label>
              <NativeSelect id="status-filter" value={status} onChange={(e) => setParam("status", e.target.value)} className="mt-1">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label htmlFor="owner-filter" className="label">Owner</label>
              <NativeSelect id="owner-filter" value={owner} onChange={(e) => setParam("owner", e.target.value)} className="mt-1">
                <option value="">Anyone</option>
                {members?.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user_id === user.id ? "Me" : m.full_name || m.email}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label htmlFor="sort-order" className="label">Sort by</label>
              <NativeSelect id="sort-order" value={sort} onChange={(e) => setParam("sort", e.target.value === "recent" ? "" : e.target.value)} className="mt-1">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </NativeSelect>
            </div>
            <Checkbox className="h-9 items-center" checked={archived} onChange={(v) => setParam("archived", v ? "1" : "")} label="Show archived" />
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                icon={<X className="size-3.5" aria-hidden />}
                onClick={() => {
                  setSearch("");
                  router.replace(sort === "recent" ? "/app/investigations" : `/app/investigations?sort=${sort}`);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={6} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState title="No cases match these filters" description="Try a different supplier name or reference, or clear the filters." />
          ) : (
            <EmptyState
              title="No investigations yet"
              description="Create a case, upload the purchase order, invoice, and delivery receipt, and OpsWarden will compare them."
              action={can("create_case") ? <ButtonLink href="/app/investigations/new" variant="accent" size="sm">New investigation</ButtonLink> : null}
            />
          )
        ) : (
          <div aria-busy={isFetching}>
            <CaseTable cases={rows} />
            <p className="flex justify-between border-t border-line px-5 py-2.5 font-mono text-[11px] text-ink-3" role="status">
              <span>
                {rows.length === 1 ? "1 case" : `${rows.length} cases`}
                {filtered ? " match your filters" : ""}
              </span>
              <span>{isFetching ? "Refreshing…" : SORTS.find((s) => s.value === sort)?.label}</span>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
