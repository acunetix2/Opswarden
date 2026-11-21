"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DocumentTypeIcon } from "@/components/documents/document-type-icon";
import { ExtractionReview } from "@/components/documents/extraction-review";
import { CaseStatusBadge } from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { latestByType } from "@/lib/documents";
import { DOCUMENT_TYPE_LABEL } from "@/lib/format";
import type { DocumentMeta } from "@/lib/types";
import { useAnalyzeMutation, useCaseDocumentsQuery, useExtractedFieldsQuery, useGetCaseQuery } from "@/store/api";
import { useToast, useWorkspace } from "@/store/hooks";

function DocumentFields({ doc, caseId, onlyNeedsReview, canCorrect, onChanged }: { doc: DocumentMeta; caseId: string; onlyNeedsReview: boolean; canCorrect: boolean; onChanged: () => void }) {
  const q = useExtractedFieldsQuery(doc.id);
  const fields = q.data?.fields ?? [];
  const toCheck = fields.filter((f) => f.review_status === "needs_review").length;

  return (
    <Card>
      <header className="flex items-center gap-4 border-b border-ink px-5 py-3.5">
        <DocumentTypeIcon type={doc.document_type} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-ink">{DOCUMENT_TYPE_LABEL[doc.document_type]}</h2>
          <p className="truncate font-mono text-[11.5px] text-ink-3">{doc.original_filename}</p>
        </div>
        <span className={toCheck ? "label text-warning" : "label text-success"}>{toCheck ? `${toCheck} to check` : "All checked"}</span>
        <Link href={`/app/documents/${doc.id}`} className="text-[12px] font-medium text-brand-ink hover:underline">
          With source →
        </Link>
      </header>
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data ? (
        <SkeletonRows rows={3} className="px-5 pb-5" />
      ) : doc.processing_status !== "extracted" ? (
        <EmptyState title="Not extracted" description={doc.error_code ? `Reason: ${doc.error_code.replace(/_/g, " ").toLowerCase()}. Replace the file from the case page.` : "Run the analysis to extract fields."} />
      ) : (
        <ExtractionReview
          documentId={doc.id}
          caseId={caseId}
          fields={fields}
          highlight={null}
          canCorrect={canCorrect}
          onlyNeedsReview={onlyNeedsReview}
          onCorrected={onChanged}
        />
      )}
    </Card>
  );
}

/** Every uncertain extracted field across the case's current documents, in one place. */
export function FieldReviewView({ caseId }: { caseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useWorkspace();
  const caseQ = useGetCaseQuery(caseId);
  const docsQ = useCaseDocumentsQuery(caseId);
  const [analyze, analyzeState] = useAnalyzeMutation();
  const [onlyNeedsReview, setOnly] = useState(true);
  const [changed, setChanged] = useState(0);

  if (caseQ.error) return <ErrorState error={caseQ.error} onRetry={caseQ.refetch} />;
  const kase = caseQ.data;
  if (!kase) return <Skeleton className="h-96 w-full" />;

  const current = Object.values(latestByType(docsQ.data)) as DocumentMeta[];
  const closed = ["resolved", "archived"].includes(kase.status);

  async function rerun() {
    try {
      await analyze(caseId).unwrap();
      toast("info", "Re-running the analysis with your corrections");
      router.push(`/app/investigations/${caseId}`);
    } catch (err) {
      toast("danger", "The analysis couldn't start", toAppError(err).message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <nav aria-label="Breadcrumb" className="label flex flex-wrap gap-x-2">
          <Link href="/app/investigations" className="hover:text-ink">Investigations</Link>
          <span aria-hidden>/</span>
          <Link href={`/app/investigations/${kase.id}`} className="hover:text-ink">{kase.case_number}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-ink">Field review</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="figure text-[13px] text-ink-2">{kase.case_number}</span>
              <CaseStatusBadge status={kase.status} />
            </div>
            <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[26px]">Check what was read</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
              Confirm values that were read correctly, or correct them. Originals stay in the audit trail. Extraction
              confidence describes how reliably text was read, not whether the supplier is right.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox checked={onlyNeedsReview} onChange={setOnly} label="Only fields to check" />
            {!closed && can("upload_document") ? (
              <Button onClick={rerun} loading={analyzeState.isLoading} disabled={kase.status === "processing"}>
                Re-run analysis
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {changed > 0 && !closed ? (
        <Notice tone="info" title={`${changed} change${changed === 1 ? "" : "s"} saved`}>
          Findings update after you re-run the analysis.
        </Notice>
      ) : null}
      {!can("correct_fields") ? <Notice tone="info">Your role can view fields but not change them.</Notice> : null}

      {docsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : current.length === 0 ? (
        <Card>
          <EmptyState title="No documents yet" description="Upload documents on the case page first." />
        </Card>
      ) : (
        current.map((d) => (
          <DocumentFields
            key={d.id}
            doc={d}
            caseId={caseId}
            onlyNeedsReview={onlyNeedsReview}
            canCorrect={can("correct_fields") && !closed && d.processing_status === "extracted"}
            onChanged={() => setChanged((n) => n + 1)}
          />
        ))
      )}
    </div>
  );
}
