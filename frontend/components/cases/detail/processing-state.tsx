import { WardenIcon } from "@/components/assistant/warden-icon";
import { cn } from "@/lib/cn";
import { DOCUMENT_TYPE_LABEL } from "@/lib/format";
import type { CaseStreamEvent, DocumentType } from "@/lib/types";

type StepState = "done" | "active" | "failed" | "waiting";

interface Step {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
}

/** Turns the live event stream into a readable checklist. */
function buildSteps(events: CaseStreamEvent[]): Step[] {
  const docs = new Map<string, Step>();
  for (const e of events) {
    const id = String(e.payload.document_id ?? e.payload.document_type ?? "");
    if (!id || !e.type.startsWith("document.extraction.")) continue;
    const dtype = e.payload.document_type as DocumentType | undefined;
    const prev = docs.get(id);
    const label = `Extract ${dtype ? DOCUMENT_TYPE_LABEL[dtype].toLowerCase() : prev?.label.replace(/^Extract /, "") ?? "document"}`;
    if (e.type.endsWith("started")) docs.set(id, { key: id, label, state: "active" });
    if (e.type.endsWith("completed")) docs.set(id, { key: id, label: prev?.label ?? label, state: "done" });
    if (e.type.endsWith("failed")) {
      docs.set(id, { key: id, label: prev?.label ?? label, state: "failed", detail: String(e.payload.error_code ?? "").replace(/_/g, " ").toLowerCase() || undefined });
    }
  }
  const has = (t: string) => events.find((e) => e.type === t);
  const compared = has("comparison.completed");
  const done = has("investigation.completed");
  const failed = has("analysis.failed");
  const anyDocActive = [...docs.values()].some((d) => d.state === "active");

  return [
    { key: "start", label: "Read documents", state: events.length ? "done" : "active" },
    ...docs.values(),
    {
      key: "compare",
      label: "Match line items, apply comparison rules",
      state: failed ? "failed" : compared ? "done" : docs.size && !anyDocActive ? "active" : "waiting",
      detail: compared ? `${compared.payload.finding_count ?? 0} finding${compared.payload.finding_count === 1 ? "" : "s"}` : undefined,
    },
    { key: "investigate", label: "Write the investigation summary", state: failed ? "failed" : done ? "done" : compared ? "active" : "waiting" },
  ];
}

const MARK: Record<StepState, { text: string; cls: string }> = {
  done: { text: "OK", cls: "text-success" },
  active: { text: "··", cls: "text-brand-ink animate-pulse" },
  failed: { text: "ERR", cls: "text-danger" },
  waiting: { text: "—", cls: "text-ink-3" },
};

const STATE_LABEL: Record<StepState, string> = { done: "done", active: "in progress", failed: "failed", waiting: "waiting" };

/** Live run log, printed like a terminal receipt. */
export function ProcessingState({ events, live }: { events: CaseStreamEvent[]; live: boolean }) {
  const steps = buildSteps(events);
  const finished = steps.filter((s) => s.state === "done").length;
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-[12px] border border-ink bg-ink text-canvas">
      <div className="flex items-center gap-3 border-b border-sidebar-line px-5 py-2.5">
        <WardenIcon className="size-7 shrink-0" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand">OpsWarden agent · analysis running</span>
        <span className="font-mono text-[11px] text-sidebar-muted">
          {finished}/{steps.length} steps · {live ? "live" : "checking"}
        </span>
        <span className="ml-auto h-px w-24 overflow-hidden bg-sidebar-line">
          <span className="block h-full w-1/3 animate-[ledger-load_1.1s_var(--ease-out)_infinite] bg-brand" />
        </span>
      </div>
      <ol className="px-5 py-3 font-mono text-[12.5px]">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("grid grid-cols-[2rem_3rem_1fr] py-0.5", s.state === "waiting" ? "text-sidebar-muted" : "text-canvas")}>
            <span className="text-sidebar-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className={MARK[s.state].cls}>{MARK[s.state].text}</span>
            <span>
              {s.label}
              <span className="sr-only">: {STATE_LABEL[s.state]}</span>
              {s.detail ? <span className="text-sidebar-muted"> · {s.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t border-sidebar-line px-5 py-2 text-[12px] text-sidebar-muted">
        The agent reads and compares the documents only. It never sends anything or changes payments; you review every finding it records.
      </p>
    </div>
  );
}
