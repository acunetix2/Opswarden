"use client";

import { BookUser, Check, FileText, GitCompareArrows, Scale, Send, X, type LucideIcon } from "lucide-react";

import { WardenIcon } from "@/components/assistant/warden-icon";
import { buildStages, type Stage, type StageKey } from "@/lib/analysis-stages";
import { cn } from "@/lib/cn";
import type { CaseStreamEvent } from "@/lib/types";

const ICONS: Record<StageKey, LucideIcon> = {
  read: FileText,
  register: BookUser,
  match: GitCompareArrows,
  review: Scale,
  follow_up: Send,
};

const STATE_WORDS = { waiting: "waiting", active: "in progress", done: "done", failed: "stopped" } as const;

function StageCircle({ stage, index }: { stage: Stage; index: number }) {
  const Icon = ICONS[stage.key];
  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
      {stage.state === "done" ? (
        <span key="done" className="ow-stage-pop inline-flex size-11 items-center justify-center rounded-full bg-success text-canvas">
          <Check className="size-5" strokeWidth={2.6} aria-hidden />
        </span>
      ) : stage.state === "failed" ? (
        <span key="failed" className="ow-stage-pop inline-flex size-11 items-center justify-center rounded-full bg-danger text-canvas">
          <X className="size-5" strokeWidth={2.6} aria-hidden />
        </span>
      ) : stage.state === "active" ? (
        <>
          <span key="active" className="inline-flex size-11 items-center justify-center rounded-full border-2 border-brand-soft bg-brand-tint text-brand-ink">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {/* A quarter arc turning around the circle: the stage is working. */}
          <span aria-hidden className="ow-stage-spin pointer-events-none absolute inset-0 rounded-full border-2 border-transparent border-t-brand" />
        </>
      ) : (
        <span key="waiting" className="inline-flex size-11 items-center justify-center rounded-full border-2 border-line-strong bg-surface font-mono text-[12.5px] text-ink-3">
          {index + 1}
        </span>
      )}
    </span>
  );
}

/** Filled when the stage before it is done; grows from the earlier stage. */
function Connector({ filled, direction }: { filled: boolean; direction: "row" | "column" }) {
  const row = direction === "row";
  return (
    <span
      aria-hidden
      className={cn(
        "overflow-hidden rounded-full bg-line",
        row ? "mx-2 hidden h-[3px] flex-1 md:block" : "my-1.5 block min-h-5 w-[3px] flex-1 md:hidden",
      )}
    >
      <span
        className={cn("block size-full bg-success transition-transform duration-300", row ? "origin-left" : "origin-top")}
        style={{ transform: filled ? "scale(1)" : row ? "scaleX(0)" : "scaleY(0)", transitionTimingFunction: "var(--ease-out)" }}
      />
    </span>
  );
}

interface AnalysisStagesProps {
  events: CaseStreamEvent[];
  live: boolean;
  onClose?: () => void;
}

/** Live view of one analysis run: five stages, ticked as each one completes. */
export function AnalysisStages({ events, live, onClose }: AnalysisStagesProps) {
  const run = buildStages(events);
  const doneCount = run.stages.filter((s) => s.state === "done").length;
  const heading = run.failed
    ? "The analysis stopped"
    : run.finished
      ? "Analysis finished"
      : `Analyzing · step ${Math.min(doneCount + 1, run.stages.length)} of ${run.stages.length}`;

  return (
    <section aria-labelledby="analysis-stages-title" className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <WardenIcon className="size-7 shrink-0" tone="dark" />
        <div className="min-w-0">
          <h2 id="analysis-stages-title" className="text-[14.5px] font-semibold text-ink">{heading}</h2>
          <p className="text-[12px] text-ink-3">
            {run.finished
              ? run.seconds
                ? `${doneCount} of ${run.stages.length} stages done in ${run.seconds}s`
                : `${doneCount} of ${run.stages.length} stages done`
              : live
                ? "Following the run live"
                : "Connecting to the run…"}
          </p>
        </div>
        {!run.finished ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-ink-3">
            <span aria-hidden className={cn("size-2 rounded-full", live ? "bg-success" : "bg-line-strong")} />
            {live ? "Live" : "Waiting"}
          </span>
        ) : onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="pressable ml-auto rounded-full px-3 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-surface-muted hover:text-ink"
          >
            Hide
          </button>
        ) : null}
      </header>

      <ol role="list" className="flex flex-col px-5 py-5 md:flex-row" aria-live="polite">
        {run.stages.map((stage, i) => {
          const last = i === run.stages.length - 1;
          return (
            <li key={stage.key} className="flex min-w-0 gap-3 md:flex-1 md:flex-col md:gap-3">
              <div className="flex flex-col items-center md:flex-row">
                <StageCircle stage={stage} index={i} />
                {!last ? <Connector filled={stage.state === "done"} direction="column" /> : null}
                {!last ? <Connector filled={stage.state === "done"} direction="row" /> : null}
              </div>
              <div className={cn("min-w-0 pt-2 md:pt-0 md:pr-4", last ? "pb-0" : "pb-4 md:pb-0")}>
                <p className={cn("text-[13.5px] font-medium leading-snug", stage.state === "waiting" ? "text-ink-3" : "text-ink")}>
                  {stage.label}
                  <span className="sr-only">: {STATE_WORDS[stage.state]}</span>
                </p>
                <p className={cn("mt-0.5 text-[12px] leading-snug", stage.state === "failed" ? "text-danger" : "text-ink-3")}>{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="border-t border-line bg-canvas/50 px-5 py-2.5 text-[12px] text-ink-3">
        OpsWarden reads and compares the documents and queues any supplier letter for approval. It never sends a letter or changes a payment on its own.
      </p>
    </section>
  );
}
