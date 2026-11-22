import assert from "node:assert/strict";
import { test } from "node:test";

import { amountProblem, defaultRecoveredAmount, outcomeLabel, outcomeRecovers } from "../lib/recovery.ts";

test("only recovered and corrected invoice outcomes carry an amount", () => {
  assert.equal(outcomeRecovers("recovered"), true);
  assert.equal(outcomeRecovers("corrected_invoice"), true);
  assert.equal(outcomeRecovers("no_discrepancy"), false);
  assert.equal(outcomeRecovers("written_off"), false);
});

test("amount check matches the server rules", () => {
  assert.equal(amountProblem(""), null);
  assert.equal(amountProblem("1250"), null);
  assert.equal(amountProblem("1,250.50"), null);
  assert.match(amountProblem("-5") ?? "", /negative/);
  assert.match(amountProblem("1e40") ?? "", /number/);
  assert.match(amountProblem("12.5.1") ?? "", /number/);
});

test("prefill uses exposure in the case currency only", () => {
  const exposure = [
    { currency: "EUR", amount: "10.00" },
    { currency: "USD", amount: "480.00" },
  ];
  assert.equal(defaultRecoveredAmount(exposure, "USD"), "480.00");
  assert.equal(defaultRecoveredAmount(exposure, "KES"), "");
  assert.equal(defaultRecoveredAmount(undefined, "USD"), "");
});

test("labels use plain words", () => {
  assert.equal(outcomeLabel("corrected_invoice"), "Corrected invoice");
  assert.equal(outcomeLabel(null), null);
  assert.equal(outcomeLabel("unknown"), null);
});
