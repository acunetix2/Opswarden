import Link from "next/link";

import { CaseStatusBadge } from "@/components/status/status-badges";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import type { Case } from "@/lib/types";

function Findings({ count }: { count: number }) {
  return (
    <span className={cn("figure text-[13px]", count ? "text-ink" : "text-ink-3")}>
      {count ? String(count).padStart(2, "0") : "—"}
      <span className="sr-only">{count === 1 ? " open finding" : " open findings"}</span>
    </span>
  );
}

/** The case register: one ruled line per case, mono identifiers, the title in plain type. */
export function CaseTable({ cases }: { cases: Case[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Investigations</caption>
          <thead>
            <tr className="border-b border-line bg-canvas/60">
              <th scope="col" className="label px-5 py-2.5 font-medium">Case</th>
              <th scope="col" className="label px-3 py-2.5 font-medium">Title · reference</th>
              <th scope="col" className="label px-3 py-2.5 font-medium">Supplier</th>
              <th scope="col" className="label px-3 py-2.5 text-right font-medium">Open</th>
              <th scope="col" className="label px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="label px-3 py-2.5 font-medium">Owner</th>
              <th scope="col" className="label px-5 py-2.5 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cases.map((c) => (
              <tr key={c.id} className="group relative transition-colors hover:bg-surface-muted/70">
                <td className="whitespace-nowrap px-5 py-3">
                  {/* The whole row is clickable via this link's stretched hit area. */}
                  <Link
                    href={`/app/investigations/${c.id}`}
                    className="font-mono text-[12.5px] font-medium text-ink before:absolute before:inset-0 group-hover:text-brand-ink"
                  >
                    {c.case_number}
                  </Link>
                </td>
                <td className="max-w-72 px-3 py-3">
                  <span className="block truncate text-ink">{c.title}</span>
                  {c.supplier_reference ? <span className="block font-mono text-[11px] text-ink-3">{c.supplier_reference}</span> : null}
                </td>
                <td className="max-w-44 truncate px-3 py-3 text-ink-2">{c.supplier_name ?? "—"}</td>
                <td className="px-3 py-3 text-right"><Findings count={c.finding_count} /></td>
                <td className="px-3 py-3"><CaseStatusBadge status={c.status} /></td>
                <td className="max-w-36 truncate px-3 py-3 text-ink-2">{c.owner_name ?? "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-[11.5px] text-ink-3">{relativeTime(c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {cases.map((c) => (
          <li key={c.id}>
            <Link href={`/app/investigations/${c.id}`} className="block px-4 py-3.5 hover:bg-surface-muted/70">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12.5px] font-medium text-ink">{c.case_number}</span>
                <CaseStatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-[14px] text-ink">{c.title}</p>
              <p className="mt-1 flex justify-between gap-3 text-[12px] text-ink-3">
                <span className="truncate">{c.supplier_name ?? "No supplier"}</span>
                <span className="shrink-0 font-mono">{c.finding_count} open · {relativeTime(c.updated_at)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
