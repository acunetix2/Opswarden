/**
 * Case lifecycle as the user sees it. Pure and dependency-free so it can be
 * unit-tested with `node --test` (see tests/case-progress.test.ts).
 */

export interface ProgressInput {
  hasDocuments: boolean;
  analyzing: boolean;
  analyzed: boolean;
  /** Findings that still need a person's decision (open or needs_review). */
  unreviewed: number;
  /** A supplier email was approved or already sent. */
  approved: boolean;
  pendingApproval: boolean;
  resolved: boolean;
  canReview: boolean;
}

export interface ProgressState {
  /** One flag per step in CASE_STEPS. */
  done: boolean[];
  /** Index of the step to work on now, or -1 when the case is closed. */
  current: number;
  /** One sentence telling the user what to do next. */
  next: string;
}

export const CASE_STEPS = ["Upload documents", "Run analysis", "Review findings", "Supplier email", "Resolve"] as const;

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function evaluateProgress(p: ProgressInput): ProgressState {
  if (p.resolved) return { done: CASE_STEPS.map(() => true), current: -1, next: "This case is closed. Reopen it from the top right if something changes." };

  const reviewed = p.analyzed && p.unreviewed === 0;
  const done = [p.hasDocuments, p.analyzed, reviewed, p.approved, false];
  const current = done.findIndex((d) => !d);

  const n = p.unreviewed;
  const messages = [
    "Upload the purchase order, invoice and delivery receipt, then press Run analysis.",
    p.analyzing ? "The analysis is running. This page updates when it finishes." : "Press Run analysis in the Analysis engine panel just below.",
    p.canReview
      ? `${n} ${plural(n, "finding needs", "findings need")} a decision. Confirm real ones, dismiss false alarms with a reason.`
      : `${n} ${plural(n, "finding still needs", "findings still need")} a reviewer's decision.`,
    p.pendingApproval
      ? "A supplier email is waiting for a reviewer's approval. Find it under Approvals."
      : "Draft the supplier email at the bottom of this page, or skip this if you settled it another way.",
    "Press Mark resolved once the supplier has answered, and note the outcome.",
  ];

  return { done, current, next: messages[current] ?? "" };
}
