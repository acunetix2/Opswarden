"use client";

import { CheckCircle2, CircleDashed, Play, RotateCcw } from "lucide-react";

import { WardenIcon } from "@/components/assistant/warden-icon";
import { Button } from "@/components/ui/button";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { DOCUMENT_TYPES, latestByType } from "@/lib/documents";
import { DOCUMENT_TYPE_LABEL } from "@/lib/format";
import type { Case, DocumentMeta } from "@/lib/types";
import { useAnalyzeMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

interface AnalysisPanelProps {
  kase: Case;
  documents: DocumentMeta[] | undefined;
  analyzed: boolean;
  canRun: boolean;
}

/**
 * The "engine" control on a case: shows which documents the agent will read
 * and a single, obvious button to run (or re-run) the analysis.
 */
export function AnalysisPanel({ kase, documents, analyzed, canRun }: AnalysisPanelProps) {
  const toast = useToast();
  const [analyze, { isLoading }] = useAnalyzeMutation();
  const latest = latestByType(documents);
  const ready = DOCUMENT_TYPES.filter((t) => latest[t] && latest[t]!.processing_status !== "failed");
  const closed = kase.status === "resolved" || kase.status === "archived";
  const busy = kase.status === "processing";

  if (closed || busy) return null;

  async function run() {
    try {
      await analyze(kase.id).unwrap();
      toast("info", analyzed ? "Re-running the analysis" : "Analysis started", "The agent's progress appears on this page.");
    } catch (err) {
      toast("danger", "The analysis couldn't start", toAppError(err).message);
    }
  }

  const noDocs = !documents?.length;
  const reason = noDocs
    ? "Upload at least one document below to enable the analysis."
    : ready.length < 3
      ? `${3 - ready.length} of 3 documents missing. You can run now; missing records are flagged, never guessed.`
      : analyzed
        ? "Re-run after correcting a field or replacing a document to refresh the findings."
        : "All three documents are on file. The agent will compare them line by line.";

  return (
    <section
      aria-label="Analysis engine"
      className={cn(
        "flex flex-col gap-4 rounded-[12px] border p-4 sm:flex-row sm:items-center print:hidden",
        analyzed ? "border-line bg-surface" : "border-brand/40 bg-brand-tint/60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <WardenIcon className="size-11" animated={!analyzed && !noDocs} />
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold text-ink">{analyzed ? "Analysis engine" : "Run the analysis engine"}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{reason}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {DOCUMENT_TYPES.map((t) => {
              const ok = ready.includes(t);
              return (
                <li
                  key={t}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px]",
                    ok ? "border-success/35 bg-success-soft text-success" : "border-line-strong bg-surface text-ink-3",
                  )}
                >
                  {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
                  {DOCUMENT_TYPE_LABEL[t]}
                  <span className="sr-only">{ok ? ": ready" : ": missing"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {canRun ? (
        <Button
          variant={analyzed ? "secondary" : "accent"}
          onClick={run}
          loading={isLoading}
          disabled={noDocs}
          title={noDocs ? "Upload at least one document first" : undefined}
          icon={analyzed ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          className="h-10 px-5 text-[14px] sm:shrink-0"
        >
          {analyzed ? "Re-run analysis" : "Run analysis"}
        </Button>
      ) : (
        <p className="text-[12.5px] text-ink-3 sm:max-w-48">Your role can&apos;t run the analysis. Ask a contributor, reviewer or admin.</p>
      )}
    </section>
  );
}
