"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { DocumentTypeIcon } from "@/components/documents/document-type-icon";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { DOCUMENT_TYPES, latestByType } from "@/lib/documents";
import { DOCUMENT_TYPE_LABEL } from "@/lib/format";
import type { Case } from "@/lib/types";
import { useAnalyzeMutation, useCaseDocumentsQuery } from "@/store/api";
import { useToast } from "@/store/hooks";

/** Final check before the run: a summary slip of the case and its three records. */
export function ReviewStep({ kase, onBack }: { kase: Case; onBack: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { data } = useCaseDocumentsQuery(kase.id);
  const [analyze, { isLoading, error }] = useAnalyzeMutation();
  const latest = latestByType(data);
  const missing = DOCUMENT_TYPES.filter((t) => !latest[t]);

  async function start() {
    try {
      await analyze(kase.id).unwrap();
      toast("info", "Analysis started", "Follow the progress on the case page.");
      router.push(`/app/investigations/${kase.id}`);
    } catch {
      /* error shown inline */
    }
  }

  const facts: [string, ReactNode][] = [
    ["Case", <span key="c" className="font-mono">{kase.case_number}</span>],
    ["Title", kase.title],
    ["Supplier", kase.supplier_name ?? "Read from documents"],
    ["PO reference", <span key="p" className="font-mono">{kase.supplier_reference ?? "—"}</span>],
    ["Currency", <span key="cur" className="font-mono">{kase.currency}</span>],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-5 [&>div]:bg-surface">
        {facts.map(([k, v]) => (
          <div key={k} className="px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className="mt-1 truncate text-[13.5px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="label mb-2">Records on file</p>
        <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
          {DOCUMENT_TYPES.map((t) => {
            const doc = latest[t];
            return (
              <li key={t} className="flex items-center gap-4 px-4 py-3">
                <DocumentTypeIcon type={t} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{DOCUMENT_TYPE_LABEL[t]}</p>
                  <p className="truncate font-mono text-[11.5px] text-ink-3">{doc ? doc.original_filename : "Not uploaded"}</p>
                </div>
                <Badge tone={doc ? "success" : "warning"}>{doc ? "Ready" : "Missing"}</Badge>
              </li>
            );
          })}
        </ul>
      </div>

      {missing.length > 0 ? (
        <Notice tone="warning" title="Full three-way matching needs all three records">
          Missing: {missing.map((t) => DOCUMENT_TYPE_LABEL[t].toLowerCase()).join(", ")}. You can still run the analysis
          (missing records are flagged, never guessed), or save the draft and come back.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{toAppError(error).message}</Notice> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
          Back
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href={`/app/investigations/${kase.id}`} variant="secondary">
            Save draft and exit
          </ButtonLink>
          <Button variant="accent" onClick={start} loading={isLoading} disabled={missing.length === 3}>
            Start analysis →
          </Button>
        </div>
      </div>
    </div>
  );
}
