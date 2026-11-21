import type { Finding } from "./types";

/**
 * Plain-language description of how each rule's impact amount is calculated,
 * matching backend/app/services/comparison_service.py exactly.
 */
export const IMPACT_FORMULA: Record<string, string> = {
  INVOICE_QTY_GT_RECEIVED: "(invoiced quantity − received quantity) × invoice unit price",
  UNIT_PRICE_MISMATCH: "(invoice unit price − PO unit price) × invoiced quantity",
  LINE_TOTAL_MISMATCH: "line total − (quantity × unit price)",
  TOTAL_MISMATCH: "grand total − (subtotal + tax)",
};

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const dismissed = Number(a.status === "dismissed") - Number(b.status === "dismissed");
    if (dismissed) return dismissed;
    return (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
  });
}

export function isActive(f: Finding): boolean {
  return f.status !== "dismissed";
}

/** Labels the compared fields, e.g. "received_quantity" → "Received". */
export function comparedLabel(field: string | undefined): string {
  const map: Record<string, string> = {
    received_quantity: "Received",
    invoiced_quantity: "Invoiced",
    ordered_quantity: "Ordered",
    unit_price: "Unit price",
    line_total: "Line total",
    grand_total: "Grand total",
    po_reference: "PO reference",
    currency: "Currency",
    supplier_name: "Supplier",
    document_number: "Invoice number",
  };
  if (!field) return "Value";
  return map[field] ?? field.replace(/_/g, " ");
}

/** Evidence field paths like `line_items.quantity` match any `line_items[N].quantity`. */
export function fieldMatches(evidencePath: string, fieldPath: string): boolean {
  if (evidencePath === fieldPath) return true;
  const generic = evidencePath.replace(/^line_items\./, "");
  if (generic !== evidencePath) return new RegExp(`^line_items\\[\\d+\\]\\.${generic}$`).test(fieldPath);
  return false;
}
