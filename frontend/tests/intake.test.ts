import assert from "node:assert/strict";
import { test } from "node:test";

import { guessDocumentType, intakeOrder } from "../lib/intake.ts";

test("guesses the document type from common file names", () => {
  assert.equal(guessDocumentType("INV-8821.pdf"), "invoice");
  assert.equal(guessDocumentType("northstar_invoice_scan.jpg"), "invoice");
  assert.equal(guessDocumentType("PO-2231.pdf"), "purchase_order");
  assert.equal(guessDocumentType("purchase-order-2231.json"), "purchase_order");
  assert.equal(guessDocumentType("GRN 4471.png"), "delivery_receipt");
  assert.equal(guessDocumentType("delivery_receipt_PO-2231.pdf"), "delivery_receipt");
  assert.equal(guessDocumentType("invoice for PO 2231.pdf"), "invoice");
  assert.equal(guessDocumentType("scan0001.jpg"), "invoice");
});

test("sends purchase orders, then receipts, then invoices, keeping drop order within a type", () => {
  const items = [
    { id: "a", documentType: "invoice" as const },
    { id: "b", documentType: "delivery_receipt" as const },
    { id: "c", documentType: "invoice" as const },
    { id: "d", documentType: "purchase_order" as const },
  ];
  assert.deepEqual(intakeOrder(items).map((i) => i.id), ["d", "b", "a", "c"]);
  assert.equal(items[0]?.id, "a"); // input not mutated
});
