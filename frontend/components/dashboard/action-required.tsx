import Link from "next/link";

import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import type { AttentionItem } from "@/lib/types";

const KIND: Record<AttentionItem["kind"], { tag: string; cta: string; urgent: boolean }> = {
  approval: { tag: "Approve", cta: "Review", urgent: true },
  review: { tag: "Review", cta: "Review", urgent: true },
  prepare: { tag: "Prepare", cta: "Open", urgent: false },
  start: { tag: "Start", cta: "Open", urgent: false },
};

function hrefFor(item: AttentionItem): string {
  return item.kind === "approval" ? "/app/approvals" : `/app/investigations/${item.case_id}`;
}

/** The docket: numbered items waiting on a person, most urgent first. */
export function ActionRequired({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        index="02"
        title="Docket"
        description={items.length ? `${items.length} ${items.length === 1 ? "item" : "items"} waiting on a person` : "Nothing waiting"}
        action={
          <Link href="/app/investigations" className="text-[12px] font-medium text-brand-ink hover:underline">
            All cases →
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState title="You're all caught up" description="Nothing is waiting on you right now." />
      ) : (
        <ol className="divide-y divide-line">
          {items.map((item, i) => {
            const k = KIND[item.kind];
            return (
              <li key={`${item.kind}-${item.approval_id ?? item.case_id}`}>
                <Link
                  href={hrefFor(item)}
                  className="group relative grid grid-cols-[2rem_1fr_auto] items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/60"
                  aria-label={`${k.cta}: ${item.title}, ${item.case_number}`}
                >
                  {k.urgent ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
                  <span className="figure pt-0.5 text-[13px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug text-ink group-hover:text-brand-ink">{item.title}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 font-mono text-[11px] text-ink-3">
                      <span className={cn("uppercase tracking-[0.06em]", k.urgent ? "font-medium text-brand-ink" : "text-ink-2")}>{k.tag}</span>
                      <span aria-hidden className="text-line-strong">·</span>
                      <span className="text-ink-2">{item.case_number}</span>
                      {item.supplier_name ? (
                        <>
                          <span aria-hidden className="text-line-strong">·</span>
                          <span className="truncate font-sans text-[12px] text-ink-2">{item.supplier_name}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span aria-hidden className="pt-0.5 font-mono text-[12px] text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
