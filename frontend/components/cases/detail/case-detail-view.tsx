"use client";

import { StickyNote } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DocumentUploadCard } from "@/components/documents/document-upload-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, SectionRule } from "@/components/ui/card";
import { useCaseEvents } from "@/lib/use-case-events";
import { opswardenApi } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DOCUMENT_TYPES, latestByType } from "@/lib/documents";
import { sortFindings } from "@/lib/findings";
import {
  useApprovalsQuery,
  useCaseDocumentsQuery,
  useComparisonQuery,
  useFindingsQuery,
  useGetCaseQuery,
  useSettingsQuery,
  useSummaryQuery,
} from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { AnalysisPanel } from "./analysis-panel";
import { CaseActions } from "./case-actions";
import { CaseActivity } from "./case-activity";
import { CaseHeader } from "./case-header";
import { CaseProgress } from "./case-progress";
import { ComparisonTable } from "./comparison-table";
import { DiscrepancyCard } from "./discrepancy-card";
import { EmailComposer } from "./email-composer";
import { ExecutiveSummary } from "./executive-summary";
import { ProcessingState } from "./processing-state";
import { SourceDocuments } from "./source-documents";

/** Replay stream events from just before the case entered processing. */
function streamSince(updatedAt: string | undefined): string | undefined {
  if (!updatedAt) return undefined;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(updatedAt) ? updatedAt : `${updatedAt}Z`;
  return new Date(new Date(iso).getTime() - 2000).toISOString();
}

export function CaseDetailView({ caseId }: { caseId: string }) {
  const { workspace, can } = useWorkspace();
  const [pollWhileProcessing, setPoll] = useState(false);

  // Polling is the fallback; the event stream normally finishes the refresh first.
  const caseQ = useGetCaseQuery(caseId, { pollingInterval: pollWhileProcessing ? 2500 : 0 });
  const analyzing = caseQ.data?.status === "processing";
  useEffect(() => setPoll(analyzing), [analyzing]);

  // When a run ends (seen via polling or the stream), refresh everything derived from it.
  const dispatch = useAppDispatch();
  const wasAnalyzing = useRef(false);
  useEffect(() => {
    if (wasAnalyzing.current && !analyzing) {
      dispatch(
        opswardenApi.util.invalidateTags([
          { type: "CaseData", id: caseId },
          { type: "CaseDocuments", id: caseId },
          "Extraction",
          "Activity",
          "Overview",
          "CaseList",
        ]),
      );
    }
    wasAnalyzing.current = analyzing;
  }, [analyzing, caseId, dispatch]);
  const stream = useCaseEvents(caseId, analyzing, useMemo(() => streamSince(caseQ.data?.updated_at), [caseQ.data?.updated_at]));
  const docsQ = useCaseDocumentsQuery(caseId);
  const summaryQ = useSummaryQuery(caseId);
  const findingsQ = useFindingsQuery(caseId);
  const comparisonQ = useComparisonQuery(caseId);
  const { data: approvals } = useApprovalsQuery({ workspaceId: workspace.id });
  const { data: settings } = useSettingsQuery(workspace.id);

  const kase = caseQ.data;
  const documents = docsQ.data;
  const latest = useMemo(() => latestByType(documents), [documents]);
  const currentIds = useMemo(() => new Set(Object.values(latest).map((d) => d!.id)), [latest]);
  const findings = useMemo(() => sortFindings(findingsQ.data?.items ?? []), [findingsQ.data]);
  const caseApprovals = (approvals ?? []).filter((a) => a.case_id === caseId);
  const analyzed = Boolean(summaryQ.data?.analyzed);
  const failedDocs = Object.values(latest).filter((d) => d!.processing_status === "failed");

  if (caseQ.error) return <ErrorState error={caseQ.error} onRetry={caseQ.refetch} />;
  if (!kase) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-12 w-[28rem] max-w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Keep the documents view during a first-time run instead of an empty summary.
  const isDraft = kase.status === "draft" || (analyzing && !analyzed);
  const active = findings.filter((f) => f.status !== "dismissed");

  return (
    <div className="space-y-6">
      <CaseHeader
        kase={kase}
        actions={<CaseActions kase={kase} hasDocuments={Boolean(documents?.length)} analyzed={analyzed} />}
      />

      <CaseProgress
        hasDocuments={Boolean(documents?.length)}
        analyzing={analyzing}
        analyzed={analyzed}
        unreviewed={findings.filter((f) => f.status === "open" || f.status === "needs_review").length}
        approved={caseApprovals.some((a) => a.status === "approved" || a.status === "executed")}
        pendingApproval={caseApprovals.some((a) => a.status === "pending")}
        resolved={kase.status === "resolved"}
        canReview={can("review_finding")}
      />

      <AnalysisPanel kase={kase} documents={documents} analyzed={analyzed} canRun={can("upload_document")} />

      {analyzing ? <ProcessingState events={stream.events} live={stream.connected} /> : null}
      {kase.status === "failed" ? (
        <Notice tone="danger" title="The analysis stopped">
          Nothing was lost. Check the documents below, then run the analysis again.
        </Notice>
      ) : null}
      {kase.status === "archived" ? (
        <Notice tone="info" title="Archived">
          This case is read-only and hidden from the default list. Reopen it to continue working.
        </Notice>
      ) : null}
      {failedDocs.length ? (
        <Notice tone="danger" title="Some documents couldn't be processed">
          {failedDocs.map((d) => d!.original_filename).join(", ")}: replace the file with a digital PDF or JSON export,
          then re-run the analysis.
        </Notice>
      ) : null}
      {kase.status === "needs_review" && !analyzing ? (
        <Notice
          tone="warning"
          title="Needs review"
          action={<ButtonLink href={`/app/investigations/${kase.id}/review`} size="sm" variant="secondary">Review fields</ButtonLink>}
        >
          Some findings or extracted fields need a person to confirm them. Review them, then re-run the analysis to apply corrections.
        </Notice>
      ) : null}
      {kase.status === "resolved" ? (
        <Notice tone="success" title="Resolved">
          This case is closed. The full history remains in the activity trail.
        </Notice>
      ) : null}

      <p className="hidden font-mono text-[11px] text-ink-3 print:block">
        OpsWarden case report · {kase.case_number} · printed {new Date().toLocaleString()}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] print:block print:space-y-8">
        <div className="min-w-0 space-y-5">
          {isDraft ? (
            <Card>
              <CardHeader
                index="A"
                title="Documents"
                description="Upload the three records, then run the analysis. Missing records are flagged, not guessed."
              />
              {/* Columns follow the card's own width, not the window, so slots never get squeezed. */}
              <CardBody className="@container">
                <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {DOCUMENT_TYPES.map((t) => (
                    <DocumentUploadCard
                      key={t}
                      caseId={kase.id}
                      documentType={t}
                      existing={latest[t]}
                      maxBytes={settings?.max_upload_bytes}
                      canRemove={can("upload_document")}
                      ocrAvailable={settings?.ocr_available}
                    />
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : (
            <>
              <ExecutiveSummary summary={summaryQ.data} canListen={Boolean(settings?.tts_available)} />

              <section aria-labelledby="findings-heading" className="space-y-4">
                <SectionRule
                  index="A"
                  id="findings-heading"
                  title="Discrepancies"
                  action={<span className="font-mono text-[11px] text-ink-3">{active.length} open · {findings.length - active.length} dismissed</span>}
                />
                {!findingsQ.data ? (
                  <Skeleton className="h-48 w-full" />
                ) : findings.length === 0 ? (
                  <Card>
                    <EmptyState title="No discrepancies found" description="The records reconcile within the configured tolerances." />
                  </Card>
                ) : (
                  findings.map((f, i) => (
                    <DiscrepancyCard
                      key={f.id}
                      index={i + 1}
                      finding={f}
                      caseId={kase.id}
                      documents={documents ?? []}
                      canReview={can("review_finding") && !["resolved", "archived", "processing"].includes(kase.status)}
                    />
                  ))
                )}
              </section>

              <ComparisonTable comparison={comparisonQ.data} />

              {can("upload_document") && !["resolved", "archived", "processing"].includes(kase.status) ? (
                <details className="group border border-line bg-surface" open={Object.keys(latest).length < 3}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted/60">
                    <span>
                      <span className="block text-[14px] font-semibold text-ink">Replace or add documents</span>
                      <span className="block text-[12.5px] text-ink-3">
                        {Object.keys(latest).length < 3
                          ? `${3 - Object.keys(latest).length} of the 3 records ${3 - Object.keys(latest).length === 1 ? "is" : "are"} missing. Upload ${3 - Object.keys(latest).length === 1 ? "it" : "them"}, then run the analysis again.`
                          : "A new upload replaces the current file of that type. Run the analysis again to apply it."}
                      </span>
                    </span>
                    <span aria-hidden className="font-mono text-[12px] text-ink-3 transition-transform group-open:rotate-90">→</span>
                  </summary>
                  <div className="grid gap-4 border-t border-line p-5 xl:grid-cols-3">
                    {DOCUMENT_TYPES.map((t) => (
                      <DocumentUploadCard
                        key={t}
                        caseId={kase.id}
                        documentType={t}
                        existing={latest[t]}
                        maxBytes={settings?.max_upload_bytes}
                        canRemove={false}
                        ocrAvailable={settings?.ocr_available}
                      />
                    ))}
                  </div>
                </details>
              ) : null}

              <div className="print:hidden">
                <EmailComposer
                  kase={kase}
                  analyzed={analyzed}
                  approvals={caseApprovals}
                  emailConfigured={settings?.email_configured ?? false}
                  canDraft={can("generate_recommendation")}
                  canRequest={can("request_approval")}
                />
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4" aria-label="Case context">
          {kase.notes ? (
            <Card className="border-brand/30 bg-brand-tint/60">
              <CardHeader title="Internal note" description="Visible to your workspace only" icon={<StickyNote />} />
              <p className="whitespace-pre-wrap px-5 py-4 text-[13px] leading-relaxed text-ink">{kase.notes}</p>
            </Card>
          ) : null}
          <SourceDocuments documents={documents} currentIds={currentIds} />
          <CaseActivity caseId={kase.id} />
          {!can("review_finding") ? (
            <p className="rounded-[12px] border border-line bg-surface px-4 py-3 text-[12px] leading-relaxed text-ink-3">
              <span className="mr-1.5 font-medium text-ink-2">Your role:</span>
              You can prepare cases and correct fields. Reviewing findings and approving actions needs a reviewer.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
