import type { DocumentType } from "./types";

/**
 * A first guess at the document type from the file name. The person can change it
 * before filing; the server never trusts this guess for anything but extraction.
 */
export function guessDocumentType(filename: string): DocumentType {
  const name = filename.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\b(receipt|grn|delivery|delivered|packing|dn|pod)\b/.test(name)) return "delivery_receipt";
  if (/\b(po|purchase|order)\b/.test(name) && !/\binv(oice)?\b/.test(name)) return "purchase_order";
  return "invoice";
}

const ORDER: Record<DocumentType, number> = { purchase_order: 0, delivery_receipt: 1, invoice: 2 };

/**
 * Files are sent one at a time in this order: purchase orders, then receipts, then
 * invoices. The analysis starts when an invoice arrives, so sending it last keeps
 * every document on the same case before the case starts processing.
 */
export function intakeOrder<T extends { documentType: DocumentType }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ORDER[a.item.documentType] - ORDER[b.item.documentType] || a.index - b.index)
    .map((x) => x.item);
}

export const MATCH_LABEL: Record<string, string> = {
  open_case: "Added to open case",
  purchase_order: "Matched purchase order",
  supplier: "Matched supplier",
  document: "New case from document",
};
