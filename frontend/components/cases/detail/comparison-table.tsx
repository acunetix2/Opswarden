import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { Comparison, ComparisonLine } from "@/lib/types";

/** True when two present decimal strings differ. Display-only check. */
function differs(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return Number(a) !== Number(b);
}

function Cell({ value, flagged, money, currency, divider }: { value: string | null; flagged: boolean; money?: boolean; currency: string; divider?: boolean }) {
  return (
    <td className={cn("figure relative whitespace-nowrap px-4 py-3.5 text-right text-[15px]", flagged ? "text-brand-ink" : "text-ink", divider && "border-l border-line")}>
      {flagged ? <span aria-hidden className="absolute inset-x-3 bottom-2 h-0.5 bg-brand" /> : null}
      {money ? (value ? formatMoney(value, currency) : "—") : formatQuantity(value)}
      {flagged ? <span className="sr-only"> (differs)</span> : null}
    </td>
  );
}

function lineFlags(l: ComparisonLine) {
  return {
    received: differs(l.ordered, l.received) || differs(l.invoiced, l.received),
    invoiced: differs(l.invoiced, l.received) || differs(l.invoiced, l.ordered),
    price: differs(l.po_unit_price, l.invoice_unit_price),
  };
}

/** The three-way match as a ledger: each column is one document, mismatches underlined. */
export function ComparisonTable({ comparison }: { comparison: Comparison | undefined }) {
  return (
    <Card>
      <CardHeader index="B" title="Three-way match" description="Ordered (PO) against received (delivery receipt) against invoiced (supplier invoice)." />
      {!comparison ? (
        <SkeletonRows rows={2} className="px-5" />
      ) : comparison.lines.length === 0 ? (
        <EmptyState title="No line items to compare yet" description="Line items appear here after the documents are extracted." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Line item comparison. Cells marked “differs” disagree across documents.</caption>
            <thead>
              <tr className="border-b border-line bg-canvas/60">
                <th scope="col" className="label px-5 py-2.5 text-left font-medium">Item</th>
                <th scope="col" className="label px-4 py-2.5 text-right font-medium">Ordered <span className="text-ink-3/70">PO</span></th>
                <th scope="col" className="label px-4 py-2.5 text-right font-medium">Received <span className="text-ink-3/70">DR</span></th>
                <th scope="col" className="label px-4 py-2.5 text-right font-medium">Invoiced <span className="text-ink-3/70">INV</span></th>
                <th scope="col" className="label border-l border-line px-4 py-2.5 text-right font-medium">PO price</th>
                <th scope="col" className="label px-5 py-2.5 text-right font-medium">Inv. price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {comparison.lines.map((l) => {
                const f = lineFlags(l);
                return (
                  <tr key={l.key}>
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <span className="block text-[13.5px] font-medium text-ink">{l.description ?? l.sku ?? "Item"}</span>
                      <span className="mt-0.5 flex items-center gap-2">
                        {l.sku ? <span className="font-mono text-[11px] text-ink-3">{l.sku}</span> : null}
                        {l.match_method !== "sku" ? <Badge tone="warning">{l.match_method === "fuzzy" ? "Matched by description" : "Unmatched"}</Badge> : null}
                      </span>
                    </th>
                    <Cell value={l.ordered} flagged={false} currency={comparison.currency} />
                    <Cell value={l.received} flagged={f.received} currency={comparison.currency} />
                    <Cell value={l.invoiced} flagged={f.invoiced} currency={comparison.currency} />
                    <Cell value={l.po_unit_price} flagged={false} money currency={comparison.currency} divider />
                    <Cell value={l.invoice_unit_price} flagged={f.price} money currency={comparison.currency} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
