// Run with: npm test   (uses Node's built-in test runner and type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProgress, type ProgressInput } from "../lib/case-progress.ts";

const base: ProgressInput = {
  hasDocuments: false,
  analyzing: false,
  analyzed: false,
  unreviewed: 0,
  approved: false,
  pendingApproval: false,
  resolved: false,
  canReview: true,
};

test("a new case starts at upload", () => {
  const s = evaluateProgress(base);
  assert.equal(s.current, 0);
  assert.match(s.next, /Upload/);
});

test("documents uploaded moves to analysis", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true });
  assert.equal(s.current, 1);
  assert.match(s.next, /Run analysis/);
});

test("running analysis says so", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true, analyzing: true });
  assert.equal(s.current, 1);
  assert.match(s.next, /running/);
});

test("unreviewed findings block the review step, with correct plural", () => {
  const one = evaluateProgress({ ...base, hasDocuments: true, analyzed: true, unreviewed: 1 });
  assert.equal(one.current, 2);
  assert.match(one.next, /^1 finding needs/);
  const many = evaluateProgress({ ...base, hasDocuments: true, analyzed: true, unreviewed: 3 });
  assert.match(many.next, /^3 findings need/);
});

test("contributors are told a reviewer must decide", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true, analyzed: true, unreviewed: 2, canReview: false });
  assert.match(s.next, /reviewer's decision/);
});

test("all findings reviewed moves to the supplier email", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true, analyzed: true });
  assert.equal(s.current, 3);
  assert.match(s.next, /Draft the supplier email/);
});

test("pending approval points to Approvals", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true, analyzed: true, pendingApproval: true });
  assert.equal(s.current, 3);
  assert.match(s.next, /Approvals/);
});

test("approved email moves to resolve", () => {
  const s = evaluateProgress({ ...base, hasDocuments: true, analyzed: true, approved: true });
  assert.equal(s.current, 4);
  assert.match(s.next, /Mark resolved/);
});

test("resolved case has every step done and no current step", () => {
  const s = evaluateProgress({ ...base, resolved: true });
  assert.equal(s.current, -1);
  assert.ok(s.done.every(Boolean));
});
