"use client";

import { useId, useRef, useState, type DragEvent } from "react";

import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { DOCUMENT_TYPE_LABEL, formatBytes } from "@/lib/format";
import type { DocumentMeta, DocumentType } from "@/lib/types";
import { ACCEPT_ATTR, isImage, precheckFile } from "@/lib/upload-rules";
import { useDeleteDocumentMutation, useUploadDocumentMutation } from "@/store/api";

import { DocumentTypeIcon } from "./document-type-icon";

const HINTS: Record<DocumentType, string> = {
  purchase_order: "What was ordered, at what price.",
  invoice: "What the supplier is billing for.",
  delivery_receipt: "What actually arrived at the warehouse.",
};

interface DocumentUploadCardProps {
  caseId: string;
  documentType: DocumentType;
  /** Latest uploaded document of this type, if any. */
  existing?: DocumentMeta;
  maxBytes?: number;
  canRemove: boolean;
  /** Whether the server can OCR scans and photos. */
  ocrAvailable?: boolean;
}

/** One upload slot per document type: drag-and-drop or keyboard file picker. */
export function DocumentUploadCard({ caseId, documentType, existing, maxBytes, canRemove, ocrAvailable = false }: DocumentUploadCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, { isLoading: uploading }] = useUploadDocumentMutation();
  const [remove, { isLoading: removing }] = useDeleteDocumentMutation();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const label = DOCUMENT_TYPE_LABEL[documentType];

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setWarning(null);
    const problem = precheckFile(file, maxBytes);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await upload({ caseId, documentType, file }).unwrap();
      if (isImage(file)) {
        setWarning(
          ocrAvailable
            ? "Scans and photos are read by OCR when the analysis runs. Amounts that don't add up on the page will be flagged for you to check."
            : "OCR isn't connected on this server, so extraction will fail for this image. A digital PDF or JSON export works.",
        );
      }
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[12px] border bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)] transition-colors duration-150",
        dragging ? "border-brand bg-brand-tint" : existing ? "border-line" : "border-dashed border-line-strong",
      )}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <DocumentTypeIcon type={documentType} />
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-ink">{label}</h3>
        {existing ? <Badge tone="success" icon={<CheckCircle2 />}>Filed</Badge> : <Badge tone="neutral">Empty</Badge>}
      </div>
      <p className="px-4 pt-1.5 pb-3 text-[12.5px] leading-snug text-ink-3">{HINTS[documentType]}</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
        aria-label={`Choose ${label.toLowerCase()} file`}
      />

      {existing ? (
        <div className="mt-auto flex flex-col gap-3 border-t border-line bg-canvas/50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-[12.5px] text-ink" title={existing.original_filename}>{existing.original_filename}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">{formatBytes(existing.size_bytes)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
            aria-label={`Replace ${label.toLowerCase()}`}
          >
            Replace
          </Button>
          {canRemove ? (
            <Button
              variant="ghost"
              size="sm"
              loading={removing}
              onClick={async () => {
                setError(null);
                try {
                  await remove({ caseId, documentId: existing.id }).unwrap();
                } catch (err) {
                  setError(toAppError(err).message);
                }
              }}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              Remove
            </Button>
          ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="pressable group mx-4 mb-4 mt-auto flex flex-col items-start justify-center gap-1 rounded-[10px] border border-dashed border-line-strong bg-canvas/50 px-4 py-5 text-left hover:border-ink-3 hover:bg-surface-muted/70 disabled:opacity-60"
        >
          <span className="text-[14px] font-medium text-ink">
            {uploading ? "Filing…" : dragging ? "Drop to file it" : "Drop a file, or choose one"}
            {!uploading ? <span aria-hidden className="ml-1.5 font-mono text-ink-3 transition-transform group-hover:text-ink">↑</span> : null}
          </span>
          <span className="font-mono text-[11px] text-ink-3">.pdf · .json · .txt · .png · .jpg</span>
        </button>
      )}

      {error ? <Notice tone="danger" className="m-3">{error}</Notice> : null}
      {warning ? <Notice tone="warning" className="m-3">{warning}</Notice> : null}
    </div>
  );
}
