import Link from "next/link";

import { CaseStatusBadge } from "@/components/status/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatMoneyValue, relativeTime } from "@/lib/format";
import type { RecentCase } from "@/lib/types";

function InDispute({ c }: { c: RecentCase }) {
  if (c.exposure) return <span className="figure text-ink">{formatMoneyValue(c.exposure)}</span>;
  if (c.finding_count > 0) return <span className="text-ink-2">{c.finding_count === 1 ? "1 finding" : `${c.finding_count} findings`}</span>;
  return <span className="text-ink-3">—</span>;
}

export function RecentCases({ cases }: { cases: RecentCase[] }) {
  return (
    <Card>
      <CardHeader
        index="03"
        title="Recent cases"
        description={cases.length ? `${cases.length} most recently updated · sorted by last activity` : "No cases yet"}
        action={
          <Link href="/app/investigations" className="text-[12px] font-medium text-brand-ink hover:underline">
            Open the register →
          </Link>
        }
      />
      {cases.length === 0 ? (
        <EmptyState
          title="No investigations yet"
          description="Create a case and upload a PO, invoice, and delivery receipt to get started."
          action={<ButtonLink href="/app/investigations/new" variant="accent" size="sm">New investigation</ButtonLink>}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="label px-5 py-2.5 font-medium">Case</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Supplier</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="label px-3 py-2.5 text-right font-medium">In dispute</th>
                  <th scope="col" className="label px-5 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cases.map((c) => (
                  <tr key={c.id} className="group relative transition-colors hover:bg-surface-muted/70">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/app/investigations/${c.id}`}
                        className="block font-mono text-[13px] font-medium text-ink before:absolute before:inset-0 group-hover:text-brand-ink"
                      >
                        {c.case_number}
                      </Link>
                      <span className="block max-w-64 truncate text-[12.5px] text-ink-3">{c.title}</span>
                    </td>
                    <td className="max-w-56 truncate px-3 py-3.5 text-[13px] text-ink-2">{c.supplier_name ?? <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-3.5">
                      <CaseStatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <InDispute c={c} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-[11.5px] text-ink-3">{relativeTime(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line md:hidden">
            {cases.map((c) => (
              <li key={c.id}>
                <Link href={`/app/investigations/${c.id}`} className="block px-5 py-3.5 hover:bg-surface-muted/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12.5px] font-medium text-ink">{c.case_number}</span>
                    <CaseStatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-[13px] text-ink-2">{c.supplier_name ?? c.title}</p>
                  <p className="mt-1 flex justify-between text-[12px] text-ink-3">
                    <InDispute c={c} />
                    <span className="font-mono text-[11px]">{relativeTime(c.updated_at)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
