import type { Metadata } from "next";

import { FieldReviewView } from "@/components/cases/review/field-review-view";

export const metadata: Metadata = { title: "Review extracted fields" };

export default async function CaseReviewPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <FieldReviewView caseId={caseId} />;
}
