"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { DocumentUploadCard } from "@/components/documents/document-upload-card";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/states";
import { DOCUMENT_TYPES, latestByType } from "@/lib/documents";
import { useCaseDocumentsQuery } from "@/store/api";

interface UploadStepProps {
  caseId: string;
  maxBytes?: number;
  ocrAvailable?: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function UploadStep({ caseId, maxBytes, ocrAvailable, onBack, onNext }: UploadStepProps) {
  const { data, isLoading } = useCaseDocumentsQuery(caseId);
  const latest = latestByType(data);
  const count = Object.keys(latest).length;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-2">
        Upload each record: a digital PDF, a scan or phone photo{ocrAvailable ? " (read by OCR)" : ""}, or a JSON/text export. Files are stored
        privately and checked for type and size before processing.
      </p>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="@container">
          <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
            {DOCUMENT_TYPES.map((t) => (
              <DocumentUploadCard key={t} caseId={caseId} documentType={t} existing={latest[t]} maxBytes={maxBytes} canRemove ocrAvailable={ocrAvailable} />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden />}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11.5px] text-ink-3" role="status">{count}/3 filed</span>
          <Button onClick={onNext} iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
