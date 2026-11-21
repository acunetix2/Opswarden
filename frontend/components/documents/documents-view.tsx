"use client";

import Link from "next/link";
import { Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { DocumentStatusBadge } from "@/components/status/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { DOCUMENT_TYPE_LABEL, formatBytes, relativeTime } from "@/lib/format";
import type { DocumentType } from "@/lib/types";
import { useWorkspaceDocumentsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { DocumentTypeIcon } from "./document-type-icon";

type StatusFilter = "all" | "extracted" | "queued" | "failed";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "extracted", label: "Extracted" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
];

export function DocumentsView() {
  const { workspace, can } = useWorkspace();
  const { data, error, isLoading, refetch } = useWorkspaceDocumentsQuery(workspace.id);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | DocumentType>("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (d) =>
        (!type || d.document_type === type) &&
        (status === "all" || d.processing_status === status) &&
        (!q || d.original_filename.toLowerCase().includes(q) || d.case_number?.toLowerCase().includes(q) || d.case_title?.toLowerCase().includes(q)),
    );
  }, [data, search, type, status]);

  const failed = (data ?? []).filter((d) => d.processing_status === "failed").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="File room"
        title="Documents"
        description={
          failed
            ? `${failed} document${failed === 1 ? "" : "s"} couldn't be processed and need a replacement.`
            : "Every record on file and its processing state. Files are private to this workspace. To upload, open an investigation and file its PO, invoice and delivery receipt."
        }
        actions={
          can("create_case") ? (
            <ButtonLink href="/app/investigations/new" variant="accent" icon={<Upload className="size-4" aria-hidden />}>
              Upload for a new case
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        <div className="grid gap-4 border-b border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <div className="relative">
            <label htmlFor="doc-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="doc-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filename, case number, or title"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label htmlFor="doc-type" className="label">Type</label>
            <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value as "" | DocumentType)} className="mt-1 h-9 w-48 text-[13px]">
              <option value="">All types</option>
              {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((t) => (
                <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>
              ))}
            </Select>
          </div>
          <Segmented label="Processing status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>

        {isLoading ? (
          <SkeletonRows rows={5} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No documents match" : "No documents yet"}
            description={data?.length ? "Try another filter." : "Documents appear here once they're uploaded to a case."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Documents</caption>
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  <th scope="col" className="label px-5 py-2.5 font-medium">Type</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">File</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Case</th>
                  <th scope="col" className="label px-3 py-2.5 text-right font-medium">Size</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">State</th>
                  <th scope="col" className="label px-5 py-2.5 text-right font-medium">Filed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => (
                  <tr key={d.id} className="group relative transition-colors hover:bg-surface-muted/70">
                    <td className="px-5 py-2.5"><DocumentTypeIcon type={d.document_type} /></td>
                    <td className="max-w-80 px-3 py-2.5">
                      <Link href={`/app/documents/${d.id}`} className="block truncate font-mono text-[12.5px] text-ink before:absolute before:inset-0 group-hover:text-brand-ink">
                        {d.original_filename}
                      </Link>
                      <span className="text-[12px] text-ink-3">{DOCUMENT_TYPE_LABEL[d.document_type]}</span>
                    </td>
                    <td className="max-w-64 px-3 py-2.5">
                      <span className="block font-mono text-[12px] text-ink-2">{d.case_number}</span>
                      <span className="block truncate text-[12px] text-ink-3">{d.case_title}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-3">{formatBytes(d.size_bytes)}</td>
                    <td className="px-3 py-2.5"><DocumentStatusBadge status={d.processing_status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono text-[11.5px] text-ink-3">{relativeTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
