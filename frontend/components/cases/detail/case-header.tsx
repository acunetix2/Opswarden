import Link from "next/link";
import type { ReactNode } from "react";

import { CaseStatusBadge } from "@/components/status/status-badges";
import { formatDate } from "@/lib/format";
import type { Case } from "@/lib/types";

/** Case file cover: number and status stamp, serif title, a ruled register of facts. */
export function CaseHeader({ kase, actions }: { kase: Case; actions?: ReactNode }) {
  const facts: [string, ReactNode][] = [
    ["Supplier", kase.supplier_name ?? "—"],
    ["PO reference", <span key="po" className="font-mono">{kase.supplier_reference ?? "—"}</span>],
    ["Owner", kase.owner_name ?? "—"],
    ["Opened", <span key="o" className="font-mono">{formatDate(kase.created_at)}</span>],
    ["Currency", <span key="c" className="font-mono">{kase.currency}</span>],
  ];
  if (kase.resolved_at) facts.push(["Resolved", <span key="r" className="font-mono">{formatDate(kase.resolved_at)}</span>]);

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-3">
        <Link href="/app/investigations" className="hover:text-ink">Investigations</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="text-ink">{kase.case_number}</span>
      </nav>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="figure text-[12.5px] text-ink-3">{kase.case_number}</span>
            <CaseStatusBadge status={kase.status} />
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[26px]">{kase.title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-surface">
        {facts.map(([k, v]) => (
          <div key={k} className="px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className="mt-1 truncate text-[13.5px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
