import type { DocumentMeta, DocumentType } from "./types";

export const DOCUMENT_TYPES: DocumentType[] = ["purchase_order", "invoice", "delivery_receipt"];

/** Newest upload per type; the backend treats it as superseding older ones. */
export function latestByType<T extends DocumentMeta>(docs: T[] | undefined): Partial<Record<DocumentType, T>> {
  const out: Partial<Record<DocumentType, T>> = {};
  for (const d of [...(docs ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    out[d.document_type] = d;
  }
  return out;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "KES", "CAD", "AUD", "ZAR", "NGN", "INR", "JPY"];
