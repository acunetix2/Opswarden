import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStages } from "../lib/analysis-stages.ts";
import type { CaseStreamEvent } from "../lib/types.ts";

let clock = Date.parse("2026-11-22T10:00:00Z");
function ev(type: string, payload: Record<string, unknown> = {}): CaseStreamEvent {
  clock += 1000;
  return { type, case_id: "c", actor_type: "system", created_at: new Date(clock).toISOString(), payload: payload as Record<string, string | number>, case_status: "processing" };
}

test("nothing has happened yet: first stage waits, nothing finished", () => {
  const run = buildStages([]);
  assert.equal(run.finished, false);
  assert.deepEqual(run.stages.map((s) => s.state), ["waiting", "waiting", "waiting", "waiting", "waiting"]);
});

test("stages tick in order as events arrive", () => {
  const events = [ev("comparison.started"), ev("document.extraction.started", { document_id: "a" })];
  let run = buildStages(events);
  assert.deepEqual(run.stages.map((s) => s.state), ["active", "waiting", "waiting", "waiting", "waiting"]);
  assert.equal(run.stages[0]!.detail, "0 of 1 read");

  events.push(ev("document.extraction.completed", { document_id: "a" }), ev("register.supplier_added", { name: "Northstar" }));
  run = buildStages(events);
  assert.deepEqual(run.stages.map((s) => s.state), ["done", "done", "active", "waiting", "waiting"]);
  assert.equal(run.stages[1]!.detail, "1 supplier added");

  events.push(ev("comparison.completed", { finding_count: 2 }), ev("investigation.completed", { status: "ready_for_approval" }));
  run = buildStages(events);
  assert.deepEqual(run.stages.map((s) => s.state), ["done", "done", "done", "done", "active"]);
  assert.equal(run.stages[2]!.detail, "2 findings");
  assert.equal(run.finished, false);

  events.push(ev("automation.completed", { actions: ["letter_queued", "reviewers_emailed"] as unknown as string }));
  run = buildStages(events);
  assert.equal(run.finished, true);
  assert.equal(run.current, -1);
  assert.equal(run.stages[4]!.detail, "Letter queued for approval, reviewers emailed");
  assert.equal(run.seconds, 6);
});

test("clean cases report that they were closed", () => {
  const run = buildStages([
    ev("comparison.started"),
    ev("comparison.completed", { finding_count: 0 }),
    ev("investigation.completed", { status: "ready_for_approval" }),
    ev("automation.completed", { actions: ["resolved"] as unknown as string }),
  ]);
  assert.equal(run.stages[2]!.detail, "Everything matches");
  assert.equal(run.stages[4]!.detail, "Closed: the documents agree");
});

test("a failure marks the stage it stopped at and ends the run", () => {
  const run = buildStages([ev("comparison.started"), ev("document.extraction.started", { document_id: "a" }), ev("analysis.failed")]);
  assert.equal(run.finished, true);
  assert.equal(run.failed, true);
  assert.equal(run.stages[0]!.state, "failed");
  assert.equal(run.stages[1]!.state, "waiting");
});
