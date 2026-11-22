import type { CaseStreamEvent } from "./types";

export type StageState = "waiting" | "active" | "done" | "failed";
export type StageKey = "read" | "register" | "match" | "review" | "follow_up";

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  detail: string;
}

export interface StageRun {
  stages: Stage[];
  /** Index of the stage in progress (or the failed one), -1 when finished. */
  current: number;
  finished: boolean;
  failed: boolean;
  /** Seconds from the first to the last event, once finished. */
  seconds: number | null;
}

const STATUS_TEXT: Record<string, string> = {
  needs_review: "Needs a person to check",
  ready_for_approval: "Ready for a letter",
  resolved: "Closed",
  failed: "Stopped",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function followUpText(actions: string[]): string {
  if (actions.includes("resolved")) return "Closed: the documents agree";
  const parts: string[] = [];
  if (actions.includes("letter_queued")) parts.push("Letter queued for approval");
  if (actions.includes("reviewers_emailed")) parts.push("reviewers emailed");
  if (!parts.length) return "Handed to you";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function actionsOf(e: CaseStreamEvent | undefined): string[] {
  const raw = e?.payload.actions as unknown;
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Turns the live event stream of one analysis run into five ordered stages. */
export function buildStages(events: CaseStreamEvent[]): StageRun {
  const find = (type: string) => events.find((e) => e.type === type);
  const docs = new Map<string, "active" | "done" | "failed">();
  for (const e of events) {
    if (!e.type.startsWith("document.extraction.")) continue;
    const id = String(e.payload.document_id ?? "");
    if (!id) continue;
    if (e.type.endsWith("started")) docs.set(id, "active");
    else if (e.type.endsWith("completed")) docs.set(id, "done");
    else if (e.type.endsWith("failed")) docs.set(id, "failed");
  }
  const started = events.length > 0;
  const compared = find("comparison.completed");
  const investigated = find("investigation.completed");
  const followUp = find("automation.completed");
  const failedEvent = find("analysis.failed");
  const anyActive = [...docs.values()].includes("active");
  const readCount = [...docs.values()].filter((s) => s === "done").length;
  const unreadable = [...docs.values()].filter((s) => s === "failed").length;
  const readDone = Boolean(compared) || (docs.size > 0 && !anyActive);

  const added = {
    suppliers: events.filter((e) => e.type === "register.supplier_added").length,
    pos: events.filter((e) => e.type === "register.purchase_order_added").length,
    updated: events.filter((e) => e.type === "register.supplier_updated").length,
  };
  const registerText = [
    added.suppliers ? `${plural(added.suppliers, "supplier")} added` : "",
    added.pos ? `${plural(added.pos, "purchase order")} added` : "",
    added.updated ? `${plural(added.updated, "supplier")} updated` : "",
  ].filter(Boolean);

  const findingCount = Number(compared?.payload.finding_count ?? 0);
  const status = String(investigated?.payload.status ?? "");

  const done = [readDone, readDone, Boolean(compared), Boolean(investigated), Boolean(followUp)];
  const stages: Stage[] = [
    {
      key: "read",
      label: "Read documents",
      state: "waiting",
      detail: docs.size
        ? `${readCount} of ${docs.size} read${unreadable ? `, ${unreadable} unreadable` : ""}`
        : readDone
          ? "Already read"
          : "Text, scans and photos",
    },
    { key: "register", label: "Update register", state: "waiting", detail: registerText.length ? registerText.join(", ") : readDone ? "Nothing new" : "Suppliers, POs, numbers" },
    { key: "match", label: "Three-way match", state: "waiting", detail: compared ? (findingCount ? plural(findingCount, "finding") : "Everything matches") : "PO, receipt, invoice" },
    { key: "review", label: "Weigh findings", state: "waiting", detail: investigated ? STATUS_TEXT[status] ?? "Done" : "Severity and exposure" },
    { key: "follow_up", label: "Follow up", state: "waiting", detail: followUp ? followUpText(actionsOf(followUp)) : "Letter, emails or close" },
  ];

  let current = done.findIndex((d) => !d);
  const finished = current === -1 || Boolean(failedEvent);
  stages.forEach((s, i) => {
    if (done[i]) s.state = "done";
    else if (i === current && started) s.state = failedEvent ? "failed" : "active";
  });
  if (failedEvent && current >= 0) stages[current]!.detail = "Stopped here. Nothing was lost; run it again.";

  let seconds: number | null = null;
  if (finished && events.length > 1) {
    const times = events.map((e) => Date.parse(e.created_at)).filter((t) => !Number.isNaN(t));
    if (times.length > 1) seconds = Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 1000));
  }
  return { stages, current: finished && !failedEvent ? -1 : current, finished, failed: Boolean(failedEvent), seconds };
}
