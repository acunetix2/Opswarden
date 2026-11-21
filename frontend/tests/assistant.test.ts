import assert from "node:assert/strict";
import { test } from "node:test";

import { answer, type AssistantContext } from "../lib/assistant.ts";

const ctx: AssistantContext = {
  pathname: "/app/overview",
  canCreate: true,
  canReview: true,
  canApprove: true,
  canManage: true,
  counts: { pendingApprovals: 2, needsReview: 1, openCases: 5, openFindings: 7, exposure: "$120.00" },
  cases: [
    { id: "c1", case_number: "OW-2026-0003", title: "Northstar short delivery", supplier_name: "Northstar", supplier_reference: "PO-1048", status: "needs_review" },
  ],
};

test("explicit navigation requests navigate", () => {
  const r = answer("Take me to approvals", ctx);
  assert.equal(r.navigate, "/app/approvals");
  assert.ok(r.matched);
});

test("questions about a page explain instead of navigating", () => {
  const r = answer("How do I approve a letter?", ctx);
  assert.equal(r.navigate, undefined);
  assert.match(r.text, /Approvals/);
});

test("attention summary uses live counts and correct plurals", () => {
  const r = answer("What needs my attention?", ctx);
  assert.match(r.text, /2 supplier letters waiting for approval/);
  assert.match(r.text, /1 case needing review/);
  assert.ok(r.links?.some((l) => l.href === "/app/approvals"));
});

test("case numbers and PO references are looked up", () => {
  const byNumber = answer("show me OW-2026-0003", ctx);
  assert.equal(byNumber.links?.[0]?.href, "/app/investigations/c1");
  const byPo = answer("where is PO-1048?", ctx);
  assert.equal(byPo.links?.[0]?.href, "/app/investigations/c1");
});

test("explains the agent", () => {
  const r = answer("What does the agent do?", ctx);
  assert.match(r.text, /Run analysis/);
  assert.match(r.text, /never sends/);
});

test("page help follows the current page", () => {
  const r = answer("What should I do on this page?", { ...ctx, pathname: "/app/investigations/abc" });
  assert.match(r.text, /progress strip/);
});

test("glossary definitions", () => {
  const r = answer("What is a three-way match?", ctx);
  assert.match(r.text, /purchase order/i);
});

test("role-aware answers", () => {
  const r = answer("How do I approve?", { ...ctx, canApprove: false });
  assert.match(r.text, /can't approve/);
});

test("admin-only pages are not offered to other roles", () => {
  const r = answer("open settings", { ...ctx, canManage: false });
  assert.equal(r.navigate, undefined);
});

const NOW = Date.parse("2026-11-21T12:00:00Z");
const rich: AssistantContext = {
  ...ctx,
  userId: "u1",
  now: NOW,
  cases: [
    { id: "c1", case_number: "OW-2026-0003", title: "Northstar short delivery", supplier_name: "Northstar", supplier_reference: "PO-1048", status: "needs_review", owner_user_id: "u1", finding_count: 2, updated_at: "2026-11-01T09:00:00Z" },
    { id: "c2", case_number: "OW-2026-0004", title: "Acme price change", supplier_name: "Acme Corp", supplier_reference: "PO-2001", status: "ready_for_approval", owner_user_id: "u2", finding_count: 1, updated_at: "2026-11-20T09:00:00Z" },
  ],
  findings: [
    { id: "f1", case_id: "c1", case_number: "OW-2026-0003", supplier_name: "Northstar", title: "Invoiced more than received", severity: "high", status: "open", impact_amount: "120.00", currency: "USD" },
    { id: "f2", case_id: "c2", case_number: "OW-2026-0004", supplier_name: "Acme Corp", title: "Unit price above PO", severity: "medium", status: "confirmed", impact_amount: "45.50", currency: "USD" },
    { id: "f3", case_id: "c1", case_number: "OW-2026-0003", supplier_name: "Northstar", title: "Old dismissed", severity: "critical", status: "dismissed", impact_amount: "999.00", currency: "USD" },
  ],
  approvals: [
    { id: "a1", case_id: "c2", case_number: "OW-2026-0004", supplier_name: "Acme Corp", subject: "Price query", status: "pending", created_at: "2026-11-18T12:00:00Z" },
    { id: "a2", case_id: "c1", case_number: "OW-2026-0003", supplier_name: "Northstar", subject: "Quantity query", status: "pending", created_at: "2026-11-20T12:00:00Z" },
  ],
};

test("lists active high-severity findings and ignores dismissed ones", () => {
  const r = answer("show high severity findings", rich);
  assert.match(r.text, /Invoiced more than received/);
  assert.doesNotMatch(r.text, /Old dismissed/);
  assert.equal(r.links?.[0]?.href, "/app/investigations/c1#finding-f1");
});

test("waiting approvals are listed oldest first with how long they waited", () => {
  const r = answer("Which approvals are waiting longest?", rich);
  const acme = r.text.indexOf("Acme");
  const north = r.text.indexOf("Northstar");
  assert.ok(acme > -1 && north > acme, r.text);
  assert.match(r.text, /waiting 3 days/);
});

test("biggest findings total the money in dispute", () => {
  const r = answer("where is the money?", rich);
  assert.match(r.text, /\$165\.50/);
});

test("supplier names are recognised", () => {
  const r = answer("how is Acme doing", rich);
  assert.match(r.text, /^Acme Corp: 1 case/);
});

test("my cases and stale cases use owner and last activity", () => {
  assert.match(answer("show my cases", rich).text, /OW-2026-0003/);
  const stale = answer("any stuck cases?", rich);
  assert.match(stale.text, /OW-2026-0003 · idle 20 days/);
  assert.doesNotMatch(stale.text, /OW-2026-0004/);
});

test("summarises the case on screen", () => {
  const r = answer("what's wrong with this case?", { ...rich, pathname: "/app/investigations/c1" });
  assert.match(r.text, /1 active finding/);
  assert.match(r.text, /\$120\.00 in dispute/);
});

test("tolerates typos", () => {
  assert.equal(answer("take me to aprovals", rich).navigate, "/app/approvals");
  assert.equal(answer("open finidngs", rich).navigate, "/app/findings");
});

test("open it follows up on the last answer", () => {
  const r = answer("open it", { ...rich, lastLinks: [{ label: "OW-2026-0003", href: "/app/investigations/c1" }] });
  assert.equal(r.navigate, "/app/investigations/c1");
});

test("unknown questions are unmatched with suggestions", () => {
  const r = answer("what is the weather in Paris", ctx);
  assert.equal(r.matched, false);
  assert.ok(r.suggestions?.length);
});
