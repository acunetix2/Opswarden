"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { Stepper } from "@/components/ui/stepper";
import { useGetCaseQuery, useSettingsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { CaseDetailsStep } from "./case-details-step";
import { ReviewStep } from "./review-step";
import { UploadStep } from "./upload-step";

const STEPS = ["Case details", "Upload documents", "Review and start"];
const DESCRIPTIONS = [
  "Tell OpsWarden what this investigation is about.",
  "Add the purchase order, supplier invoice, and delivery receipt.",
  "Confirm the documents, then start the comparison.",
];

/** Three-step intake. Progress lives in the URL so a refresh resumes the draft. */
export function NewCaseWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { workspace, can } = useWorkspace();
  const caseId = params.get("case");
  const step = caseId ? Math.min(Math.max(Number(params.get("step") ?? 2), 1), 3) : 1;

  const { data: kase, error, isLoading, refetch } = useGetCaseQuery(caseId ?? "", { skip: !caseId });
  const { data: settings } = useSettingsQuery(workspace.id);

  function go(next: number, id = caseId) {
    router.replace(`/app/investigations/new?case=${id}&step=${next}`);
  }

  if (!can("create_case")) {
    return <ErrorState error={{ status: 403, code: "FORBIDDEN", message: "Your role can't create investigations." }} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/app/investigations" className="hover:text-ink">
            Investigations / new
          </Link>
        }
        title="Open an investigation"
        description={kase ? `${kase.case_number} is saved as a draft. You can leave and come back.` : "Saved as a draft as soon as you continue."}
      />
      <Stepper steps={STEPS} current={step} />
      <Card>
        <div className="border-b border-line px-6 py-5">
          <p className="text-[12.5px] font-medium text-brand-ink">Step {step} of 3</p>
          <h2 className="mt-1 text-[19px] font-semibold text-ink">{STEPS[step - 1]}</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">{DESCRIPTIONS[step - 1]}</p>
        </div>
        <CardBody className="px-6 py-6">
          {caseId && isLoading ? (
            <SkeletonRows rows={4} />
          ) : caseId && error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : kase && kase.status !== "draft" && step < 3 ? (
            <ErrorState
              error={{ status: 409, code: "NOT_DRAFT", message: "This case has already been analyzed. Open it to continue." }}
            />
          ) : step === 1 ? (
            <CaseDetailsStep workspaceId={workspace.id} existing={kase} onSaved={(id) => go(2, id)} />
          ) : step === 2 && caseId ? (
            <UploadStep
              caseId={caseId}
              maxBytes={settings?.max_upload_bytes}
              ocrAvailable={settings?.ocr_available}
              onBack={() => go(1)}
              onNext={() => go(3)}
            />
          ) : kase ? (
            <ReviewStep kase={kase} onBack={() => go(2)} />
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
