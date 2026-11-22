"use client";

import { ArrowUpRight, CheckCircle2, Inbox, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type DragEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { DOCUMENT_TYPE_LABEL, formatBytes } from "@/lib/format";
import { MATCH_LABEL, guessDocumentType, intakeOrder } from "@/lib/intake";
import type { DocumentType, IntakeResult } from "@/lib/types";
import { ACCEPT_ATTR, precheckFile } from "@/lib/upload-rules";
import { useIntakeDocumentMutation, useSettingsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

type Status = "ready" | "filing" | "filed" | "failed";

interface Item {
  id: number;
  file: File;
  documentType: DocumentType;
  status: Status;
  problem?: string;
  result?: IntakeResult;
}

const TYPE_OPTIONS = (Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }));
let nextItemId = 1;

/** Drop supplier documents without opening a case first. OpsWarden reads each one and files it. */
export function IntakeView() {
  const { workspace, can } = useWorkspace();
  const { data: settings } = useSettingsQuery(workspace.id);
  const [intake] = useIntakeDocumentMutation();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const allowed = can("create_case") && can("upload_document");

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added = Array.from(list).map<Item>((file) => {
      const problem = precheckFile(file, settings?.max_upload_bytes) ?? undefined;
      return { id: nextItemId++, file, documentType: guessDocumentType(file.name), status: problem ? "failed" : "ready", problem };
    });
    setItems((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function update(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function fileAll() {
    setRunning(true);
    // One at a time, purchase orders first and invoices last, so related documents land on one case.
    for (const item of intakeOrder(items.filter((i) => i.status === "ready"))) {
      update(item.id, { status: "filing" });
      try {
        const result = await intake({ workspaceId: workspace.id, documentType: item.documentType, file: item.file }).unwrap();
        update(item.id, { status: "filed", result });
      } catch (err) {
        update(item.id, { status: "failed", problem: toAppError(err).message });
      }
    }
    setRunning(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  const ready = items.filter((i) => i.status === "ready").length;

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Cases" title="Drop documents" />
        <Card>
          <EmptyState
            title="You can't file documents in this workspace"
            description="Filing documents opens cases, which needs the contributor, reviewer or admin role. Ask a workspace admin for access."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cases"
        title="Drop documents"
        description="Drop invoices, delivery receipts or purchase orders. OpsWarden reads each one, finds the purchase order it belongs to and files it on the right case, opening one if needed. The analysis starts once a case has an invoice and a purchase order or receipt. You still review every finding and approve every supplier letter."
      />

      <Card>
        <CardHeader index="01" title="Documents" description="PDF, scan or photo, JSON or text export. Check the type for each file before filing." />
        <CardBody className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "rounded-[12px] border border-dashed transition-colors duration-150",
              dragging ? "border-brand bg-brand-tint" : "border-line-strong bg-canvas/50",
            )}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
              aria-label="Choose documents to file"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={running}
              className="pressable flex w-full flex-col items-center justify-center gap-1.5 px-4 py-10 text-center disabled:opacity-60"
            >
              <Inbox className="size-6 text-ink-3" aria-hidden />
              <span className="text-[14.5px] font-medium text-ink">{dragging ? "Drop to add them" : "Drop files here, or choose them"}</span>
              <span className="font-mono text-[11px] text-ink-3">.pdf · .json · .txt · .png · .jpg</span>
            </button>
          </div>

          {settings && !settings.ocr_available ? (
            <Notice tone="warning">
              OCR isn't connected on this server, so scans and photos can't be read. Digital PDFs and JSON exports work.
            </Notice>
          ) : null}

          {items.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line" aria-label="Files to file">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 bg-surface px-4 py-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12.5px] text-ink" title={item.file.name}>{item.file.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">{formatBytes(item.file.size)}</p>
                  </div>
                  {item.status === "ready" || item.status === "filing" ? (
                    <div className="flex items-center gap-2 md:w-[300px]">
                      <Select
                        className="min-w-0 flex-1"
                        value={item.documentType}
                        options={TYPE_OPTIONS}
                        onChange={(v) => update(item.id, { documentType: v as DocumentType })}
                        disabled={item.status === "filing" || running}
                        label={undefined}
                      />
                      {item.status === "filing" ? (
                        <Badge tone="info">Reading…</Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                          disabled={running}
                          className="pressable inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-muted hover:text-ink"
                          aria-label={`Remove ${item.file.name}`}
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  ) : null}
                  {item.status === "filed" && item.result ? <FiledResult result={item.result} /> : null}
                  {item.status === "failed" ? (
                    <p className="text-[12.5px] text-danger md:max-w-[340px]" role="alert">{item.problem}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {items.some((i) => i.status === "filed" || i.status === "failed") ? (
              <Button variant="ghost" size="sm" disabled={running} onClick={() => setItems((prev) => prev.filter((i) => i.status === "ready"))}>
                Clear finished
              </Button>
            ) : null}
            <Button onClick={() => void fileAll()} disabled={!ready || running} loading={running}>
              {ready ? `File ${ready} ${ready === 1 ? "document" : "documents"}` : "File documents"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FiledResult({ result }: { result: IntakeResult }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 md:w-[420px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="success" icon={<CheckCircle2 />}>{DOCUMENT_TYPE_LABEL[result.document_type]} filed</Badge>
        <Badge tone="neutral">{MATCH_LABEL[result.matched_by] ?? result.matched_by}</Badge>
        {result.analysis_started ? <Badge tone="info">Analysis started</Badge> : null}
      </div>
      <p className="text-[12.5px] leading-snug text-ink-2">{result.message}</p>
      <Link
        href={`/app/investigations/${result.case_id}`}
        className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink underline-offset-2 hover:underline"
      >
        Open {result.case_number}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
