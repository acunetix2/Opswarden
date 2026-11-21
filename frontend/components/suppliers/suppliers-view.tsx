"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { formatMoneyValue, relativeTime } from "@/lib/format";
import { useSuppliersQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

/** Suppliers derived from case records. No separate supplier master data in the MVP. */
export function SuppliersView() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, refetch } = useSuppliersQuery(workspace.id);
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [data, search]);

  // Share-of-dispute bars compare suppliers in the primary currency only (display aid, not arithmetic authority).
  const primary = data?.flatMap((s) => s.exposure)[0]?.currency;
  const amountIn = (s: (typeof rows)[number]) => Number(s.exposure.find((m) => m.currency === primary)?.amount ?? 0);
  const max = Math.max(...rows.map(amountIn), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Counterparties"
        title="Suppliers"
        description="Every supplier named in your investigations, with open discrepancies and value in dispute. Click a supplier to see its cases."
      />
      <Card>
        <div className="border-b border-line px-5 py-4">
          <div className="relative max-w-md">
            <label htmlFor="sup-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="sup-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Supplier name"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={4} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState title={data?.length ? "No suppliers match" : "No suppliers yet"} description={data?.length ? undefined : "Suppliers appear once a case names one."} />
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((s) => (
              <li key={s.name}>
                <Link href={`/app/investigations?search=${encodeURIComponent(s.name)}`} className="block px-4 py-3.5 hover:bg-surface-muted/70">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{s.name}</span>
                    {s.open_cases ? <Badge tone="warning">{s.open_cases} open</Badge> : <Badge tone="success">Settled</Badge>}
                  </span>
                  <span className="mt-1 flex justify-between gap-3 text-[12px] text-ink-3">
                    <span>
                      {s.total_cases} {s.total_cases === 1 ? "case" : "cases"} · {s.active_findings} open findings
                    </span>
                    <span className="figure shrink-0 text-ink">{s.exposure.length ? s.exposure.map((m) => formatMoneyValue(m)).join(" + ") : "\u2014"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Suppliers</caption>
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  <th scope="col" className="label px-5 py-2.5 font-medium">Supplier</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Standing</th>
                  <th scope="col" className="label px-3 py-2.5 text-right font-medium">Cases</th>
                  <th scope="col" className="label px-3 py-2.5 text-right font-medium">Open findings</th>
                  <th scope="col" className="label w-[28%] px-3 py-2.5 font-medium">In dispute</th>
                  <th scope="col" className="label px-5 py-2.5 text-right font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((s) => {
                  const share = max ? amountIn(s) / max : 0;
                  return (
                    <tr key={s.name} className="group relative transition-colors hover:bg-surface-muted/70">
                      <th scope="row" className="px-5 py-3.5 font-normal">
                        <Link
                          href={`/app/investigations?search=${encodeURIComponent(s.name)}`}
                          className="text-[14px] font-medium text-ink before:absolute before:inset-0 group-hover:text-brand-ink"
                          aria-label={`${s.name}: view cases`}
                        >
                          {s.name}
                        </Link>
                      </th>
                      <td className="px-3 py-3.5">
                        {s.open_cases ? <Badge tone="warning">{s.open_cases} open</Badge> : <Badge tone="success">Settled</Badge>}
                      </td>
                      <td className="figure px-3 py-3.5 text-right text-ink-2">
                        {s.resolved_cases}/{s.total_cases}
                        <span className="sr-only"> resolved</span>
                      </td>
                      <td className="figure px-3 py-3.5 text-right text-ink">{s.active_findings ? String(s.active_findings).padStart(2, "0") : "—"}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <span aria-hidden className="h-2 flex-1 bg-surface-sunken">
                            <span className="block h-full bg-brand" style={{ width: `${Math.round(share * 100)}%` }} />
                          </span>
                          <span className="figure w-28 shrink-0 text-right text-[13px] text-ink">
                            {s.exposure.length ? s.exposure.map((m) => formatMoneyValue(m)).join(" + ") : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-[11.5px] text-ink-3">{relativeTime(s.last_activity_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
