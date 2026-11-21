"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DocumentStatusBadge } from "@/components/status/status-badges";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { openDocument } from "@/lib/download";
import { DOCUMENT_TYPE_LABEL, formatBytes, formatDateTime, humanizeFieldPath } from "@/lib/format";
import { useExtractedFieldsQuery, useFindingsQuery, useGetDocumentQuery } from "@/store/api";
import { useAppSelector, useToast, useWorkspace } from "@/store/hooks";

import { DocumentPreview } from "./document-preview";
import { DocumentTypeIcon } from "./document-type-icon";
import { ExtractionReview } from "./extraction-review";

/** Split view: the source document beside the values extracted from it (DESIGN 6.6). */
export function EvidenceViewer({ documentId }: { documentId: string }) {
  const params = useSearchParams();
  const highlight = params.get("field");
  const findingId = params.get("finding");
  const token = useAppSelector((s) => s.session.token);
  const toast = useToast();
  const { can } = useWorkspace();

  const docQ = useGetDocumentQuery(documentId);
  const fieldsQ = useExtractedFieldsQuery(documentId);
  const findingsQ = useFindingsQuery(docQ.data?.case_id ?? "", { skip: !docQ.data });

  if (docQ.error) return <ErrorState error={docQ.error} onRetry={docQ.refetch} />;
  const doc = docQ.data;
  if (!doc) return <Skeleton className="h-[600px] w-full" />;

  const finding = findingId ? findingsQ.data?.items.find((f) => f.id === findingId) : undefined;
  const citing = (findingsQ.data?.items ?? []).filter((f) => f.evidence.some((e) => e.document_id === doc.id));
  const fields = fieldsQ.data?.fields ?? [];
  const toCheck = fields.filter((f) => f.review_status === "needs_review").length;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <nav aria-label="Breadcrumb" className="label flex flex-wrap gap-x-2">
          <Link href="/app/documents" className="hover:text-ink">Documents</Link>
          <span aria-hidden>/</span>
          <Link href={`/app/investigations/${doc.case_id}`} className="hover:text-ink">{doc.case_number}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-ink normal-case tracking-normal">{doc.original_filename}</span>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <DocumentTypeIcon type={doc.document_type} className="h-12 w-14 text-[13px]" />
            <div>
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[26px]">{DOCUMENT_TYPE_LABEL[doc.document_type]}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-ink-3">
                <DocumentStatusBadge status={doc.processing_status} />
                <span>{formatBytes(doc.size_bytes)}</span>
                <span>filed {formatDateTime(doc.created_at)}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/app/investigations/${doc.case_id}`} className={buttonStyles("ghost", "md")}>
              <ArrowLeft className="size-4" aria-hidden /> Back to case
            </Link>
            <Button
              variant="secondary"
              onClick={() => openDocument(token, doc.id, doc.original_filename).catch((e) => toast("danger", "Couldn't open the file", toAppError(e).message))}
            >
              Open original ↗
            </Button>
          </div>
        </div>
      </div>

      {finding ? (
        <Notice
          tone="info"
          title={`Evidence for: ${finding.title}`}
          action={<Link href={`/app/investigations/${doc.case_id}#finding-${finding.id}`} className="text-[12px] font-medium text-brand-ink hover:underline">View finding →</Link>}
        >
          {highlight ? <>The cited field, <strong>{humanizeFieldPath(highlight)}</strong>, is marked below. </> : null}
          Region highlighting inside the file isn&apos;t available, so compare the value against the source on the left.
        </Notice>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <Card>
          <CardHeader index="A" title="Source, as stored" description="Rendered read-only. Embedded content is never executed." />
          <CardBody>
            <DocumentPreview doc={doc} />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              index="B"
              title="What was read"
              description={toCheck ? `${toCheck} low-confidence field${toCheck === 1 ? "" : "s"} to check.` : "Values read from this document."}
            />
            {fieldsQ.error ? (
              <ErrorState error={fieldsQ.error} onRetry={fieldsQ.refetch} />
            ) : !fieldsQ.data ? (
              <SkeletonRows rows={5} className="px-5 pb-5" />
            ) : fields.length === 0 ? (
              <EmptyState
                title={doc.processing_status === "failed" ? "Extraction failed" : "Not extracted yet"}
                description={
                  doc.processing_status === "failed"
                    ? `Reason: ${(doc.error_code ?? "unknown").replace(/_/g, " ").toLowerCase()}. Upload a digital PDF or JSON export instead.`
                    : "Run the analysis on the case to extract fields."
                }
              />
            ) : (
              <ExtractionReview
                documentId={doc.id}
                caseId={doc.case_id}
                fields={fields}
                highlight={highlight}
                canCorrect={can("correct_fields") && doc.processing_status === "extracted"}
                onCorrected={() => toast("info", "Re-run the analysis to apply corrections", "Open the case and choose Re-run analysis.")}
              />
            )}
          </Card>

          {citing.length ? (
            <Card>
              <CardHeader index="C" title="Cited by" description="Findings that reference this document" />
              <ul className="divide-y divide-line">
                {citing.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <Link href={`/app/investigations/${doc.case_id}#finding-${f.id}`} className="text-[13.5px] font-medium text-ink hover:text-brand-ink hover:underline">
                      {f.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {f.evidence.filter((e) => e.document_id === doc.id).map((e) => humanizeFieldPath(e.field_path)).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
