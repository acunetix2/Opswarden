"use client";

import Link from "next/link";

import { DocumentTypeIcon } from "@/components/documents/document-type-icon";
import { DocumentStatusBadge } from "@/components/status/status-badges";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { openDocument } from "@/lib/download";
import { DOCUMENT_TYPE_LABEL } from "@/lib/format";
import type { DocumentMeta } from "@/lib/types";
import { useExtractedFieldsQuery } from "@/store/api";
import { useAppSelector, useToast } from "@/store/hooks";

function ReviewCount({ documentId }: { documentId: string }) {
  const { data } = useExtractedFieldsQuery(documentId);
  const n = data?.fields.filter((f) => f.review_status === "needs_review").length ?? 0;
  if (!n) return null;
  return <span className="font-mono text-[11px] text-warning">{n} to check</span>;
}

interface SourceDocumentsProps {
  documents: DocumentMeta[] | undefined;
  /** IDs of the newest upload per type (older ones are superseded). */
  currentIds: Set<string>;
}

export function SourceDocuments({ documents, currentIds }: SourceDocumentsProps) {
  const token = useAppSelector((s) => s.session.token);
  const toast = useToast();

  return (
    <Card>
      <CardHeader title="Source documents" description="Private to this workspace" />
      {!documents ? (
        <SkeletonRows rows={3} className="px-5" />
      ) : documents.length === 0 ? (
        <EmptyState title="No documents yet" description="Upload the PO, invoice, and delivery receipt." />
      ) : (
        <ul className="divide-y divide-line">
          {documents.map((d) => {
            const superseded = !currentIds.has(d.id);
            return (
              <li key={d.id} className={superseded ? "opacity-55" : undefined}>
                <div className="flex gap-3 px-5 py-3.5">
                  <DocumentTypeIcon type={d.document_type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{DOCUMENT_TYPE_LABEL[d.document_type]}</p>
                    <p className="truncate font-mono text-[11px] text-ink-3">{d.original_filename}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <DocumentStatusBadge status={superseded ? "superseded" : d.processing_status} />
                      {d.processing_status === "extracted" && !superseded ? <ReviewCount documentId={d.id} /> : null}
                    </div>
                    {d.error_code ? <p className="mt-1 font-mono text-[11px] text-danger">{d.error_code.replace(/_/g, " ").toLowerCase()}</p> : null}
                    <div className="mt-2.5 flex gap-4 text-[12px] font-medium">
                      <Link href={`/app/documents/${d.id}`} className="text-brand-ink hover:underline">
                        Evidence &amp; fields →
                      </Link>
                      <button
                        type="button"
                        className="text-ink-2 hover:text-ink hover:underline"
                        onClick={() => openDocument(token, d.id, d.original_filename).catch((e) => toast("danger", "Couldn't open the file", toAppError(e).message))}
                      >
                        Open file ↗<span className="sr-only"> (opens in a new tab)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
