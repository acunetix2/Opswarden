import { cn } from "@/lib/cn";
import type { DocumentType } from "@/lib/types";

const CODE: Record<DocumentType, string> = { purchase_order: "PO", invoice: "INV", delivery_receipt: "DR" };

/** Document-type tag: the code clerks actually use, in a rounded tile. */
export function DocumentTypeIcon({ type, className }: { type: DocumentType; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-9 w-11 shrink-0 place-items-center rounded-[8px] border border-line bg-canvas font-mono text-[11px] font-semibold tracking-[0.04em] text-ink-2",
        className,
      )}
    >
      {CODE[type] ?? "DOC"}
    </span>
  );
}
