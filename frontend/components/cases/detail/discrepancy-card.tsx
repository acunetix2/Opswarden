"use client";

import Link from "next/link";
import { Check, Eye, X } from "lucide-react";
import { useState } from "react";

import { FindingStatusBadge, SEVERITY_RULE, SeverityBadge } from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { comparedLabel, IMPACT_FORMULA } from "@/lib/findings";
import { formatMoney, formatQuantity, humanizeFieldPath } from "@/lib/format";
import type { ComparedValue, DocumentMeta, DocumentType, Finding, FindingDecision } from "@/lib/types";
import { Term } from "@/components/ui/term";
import { useReviewFindingMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

const DOC_CODE: Record<DocumentType, string> = { purchase_order: "PO", invoice: "INV", delivery_receipt: "DR" };
const DOC_NAME: Record<DocumentType, string> = { purchase_order: "Purchase order", invoice: "Invoice", delivery_receipt: "Delivery receipt" };
/** Evidence is shown in the order a buyer reads the paperwork: ordered, received, billed. */
const DOC_ORDER: Record<DocumentType, number> = { purchase_order: 0, delivery_receipt: 1, invoice: 2 };

interface DiscrepancyCardProps {
  finding: Finding;
  /** 1-based position, printed as the exhibit number. */
  index: number;
  caseId: string;
  documents: DocumentMeta[];
  canReview: boolean;
}

function valueText(v: ComparedValue): string {
  if (v.value !== undefined) return /^-?\d+(\.\d+)?$/.test(v.value) ? formatQuantity(v.value) : v.value;
  return v.values ? Object.values(v.values).join(" / ") : "—";
}

function Figure({ label, value, flagged }: { label: string; value: ComparedValue; flagged?: boolean }) {
  return (
    <div className="relative px-5 py-4">
      {flagged ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-brand" /> : null}
      <dt className="label">
        {label} · {comparedLabel(value.field)}
      </dt>
      <dd className={cn("figure mt-2 text-[34px] leading-none", flagged ? "text-brand-ink" : "text-ink")}>
        {valueText(value)}
        {flagged ? <span className="sr-only"> (differs)</span> : null}
      </dd>
    </div>
  );
}

/** A finding presented as a numbered exhibit with its evidence trail. */
export function DiscrepancyCard({ finding, index, caseId, documents, canReview }: DiscrepancyCardProps) {
  const toast = useToast();
  const [review, { isLoading }] = useReviewFindingMutation();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState("");
  const docById = new Map(documents.map((d) => [d.id, d]));
  const dismissed = finding.status === "dismissed";
  const formula = IMPACT_FORMULA[finding.rule_id];

  const evidence = [...finding.evidence].sort((a, b) => {
    const da = a.document_id ? docById.get(a.document_id) : undefined;
    const db = b.document_id ? docById.get(b.document_id) : undefined;
    return (da ? DOC_ORDER[da.document_type] : 9) - (db ? DOC_ORDER[db.document_type] : 9);
  });

  async function decide(decision: FindingDecision, comment?: string) {
    const done: Record<FindingDecision, string> = {
      confirm: "Finding confirmed",
      dismiss: "Finding dismissed",
      needs_review: "Marked for review",
      reopen: "Finding reopened",
    };
    try {
      await review({ caseId, findingId: finding.id, decision, comment }).unwrap();
      toast("success", done[decision]);
    } catch (err) {
      toast("danger", "Couldn't update the finding", toAppError(err).message);
    }
  }

  return (
    <article
      id={`finding-${finding.id}`}
      aria-labelledby={`finding-title-${finding.id}`}
      className={cn("relative scroll-mt-24 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)]", dismissed && "opacity-60")}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", SEVERITY_RULE[finding.severity])} />

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5 pr-4 pl-6">
        <span className="label text-ink">Exhibit {String(index).padStart(2, "0")}</span>
        <span className="font-mono text-[11px] text-ink-3">{finding.rule_id}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <SeverityBadge severity={finding.severity} />
          <FindingStatusBadge status={finding.status} />
        </span>
      </header>

      <div className="py-5 pr-5 pl-6">
        <h3 id={`finding-title-${finding.id}`} className="text-[17px] font-semibold leading-snug text-ink">
          {finding.title}
        </h3>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">{finding.description}</p>
        {finding.requires_review ? (
          <p className="mt-3 text-[12.5px] text-warning">
            <span className="label mr-2 text-warning">Check</span>
            OpsWarden couldn&apos;t verify this automatically. A person needs to confirm it.
          </p>
        ) : null}
      </div>

      {finding.expected_value || finding.observed_value ? (
        <dl className="ml-1 grid gap-px border-t border-line bg-line sm:grid-cols-2 [&>div]:bg-surface">
          {finding.expected_value ? <Figure label="Expected" value={finding.expected_value} /> : null}
          {finding.observed_value ? <Figure label="Observed" value={finding.observed_value} flagged /> : null}
        </dl>
      ) : null}

      {finding.impact_amount && finding.currency ? (
        <div className="ml-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line px-5 py-3">
          <span className="label">Estimated impact</span>
          <span className="figure text-[18px] text-ink">{formatMoney(finding.impact_amount, finding.currency)}</span>
          {formula ? <span className="font-mono text-[11px] text-ink-3">= {formula}</span> : null}
        </div>
      ) : null}

      {evidence.length ? (
        <div className="ml-1 border-t border-line px-5 py-4">
          <h4 className="label mb-1">Evidence, side by side</h4>
          <p className="mb-3 text-[12px] text-ink-3">What each document says about this finding. Open a source to see the field highlighted.</p>
          <div className={cn("grid gap-2", evidence.length > 1 && "sm:grid-cols-2", evidence.length > 2 && "xl:grid-cols-3")}>
            {evidence.map((ev, i) => {
              const doc = ev.document_id ? docById.get(ev.document_id) : undefined;
              const code = doc ? DOC_CODE[doc.document_type] : "DOC";
              const name = doc ? DOC_NAME[doc.document_type] : "Document";
              const field = humanizeFieldPath(ev.field_path);
              const snippet = ev.snippet;
              return (
                <div key={`${ev.document_id}-${ev.field_path}-${i}`} className="flex flex-col rounded-[10px] border border-line bg-canvas/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-line bg-surface font-mono text-[10px] font-semibold text-ink-2">{code}</span>
                    <div className="min-w-0">
                      <p className="label text-ink">{name}</p>
                      <p className="truncate text-[13px] font-medium text-ink" title={doc?.original_filename}>{field}</p>
                    </div>
                  </div>
                  {snippet ? (
                    <p className="mt-2 flex-1 font-mono text-[12px] leading-relaxed text-ink-2">
                      &ldquo;{snippet.length > 160 ? `${snippet.substring(0, 160)}\u2026` : snippet}&rdquo;
                    </p>
                  ) : (
                    <p className="mt-2 flex-1 text-[12px] text-ink-3">No text snippet captured.</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-ink-3">{ev.page_number ? `Page ${ev.page_number}` : ""}</span>
                    {ev.document_id ? (
                      <Link
                        href={`/app/documents/${ev.document_id}?field=${encodeURIComponent(ev.field_path ?? "")}&finding=${finding.id}`}
                        className="pressable shrink-0 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium text-ink hover:border-ink-3 hover:bg-canvas"
                      >
                        View source &rarr;
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {canReview ? (
        <footer className="ml-1 flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3 print:hidden">
          <span className="label mr-auto">
            Reviewer decision: <Term term="confirm">confirm</Term> or <Term term="dismiss">dismiss</Term>
          </span>
          {finding.status === "confirmed" || dismissed ? (
            <Button size="sm" variant="ghost" disabled={isLoading} onClick={() => decide("reopen")}>
              Undo: reopen
            </Button>
          ) : null}
          <Button size="sm" variant="success" disabled={isLoading || finding.status === "confirmed"} onClick={() => decide("confirm")} icon={<Check className="size-3.5" aria-hidden />}>
            Confirm
          </Button>
          <Button size="sm" variant="secondary" disabled={isLoading || finding.status === "needs_review"} onClick={() => decide("needs_review")} icon={<Eye className="size-3.5" aria-hidden />}>
            Request review
          </Button>
          <Button size="sm" variant="danger" disabled={isLoading || dismissed} onClick={() => setDismissOpen(true)} icon={<X className="size-3.5" aria-hidden />}>
            Dismiss
          </Button>
        </footer>
      ) : null}

      <ConfirmDialog
        open={dismissOpen}
        title="Dismiss this finding?"
        description="Dismissed findings stay in the audit trail and are left out of the summary and the supplier email. You can reopen it later with Undo."
        confirmLabel="Dismiss finding"
        confirmVariant="danger"
        confirmDisabled={!reason.trim()}
        onClose={() => setDismissOpen(false)}
        onConfirm={async () => {
          await decide("dismiss", reason.trim());
          setDismissOpen(false);
          setReason("");
        }}
      >
        <Field label="Reason" htmlFor={`dismiss-${finding.id}`} required hint="Required. Recorded in the audit trail.">
          <Textarea id={`dismiss-${finding.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>
    </article>
  );
}
