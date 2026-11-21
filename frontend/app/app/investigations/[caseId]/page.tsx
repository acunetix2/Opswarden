import type { Metadata } from "next";

import { CaseDetailView } from "@/components/cases/detail/case-detail-view";

export const metadata: Metadata = { title: "Investigation" };

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailView caseId={caseId} />;
}
