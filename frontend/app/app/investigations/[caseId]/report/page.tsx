import type { Metadata } from "next";

import { CaseReport } from "@/components/cases/report/case-report";

export const metadata: Metadata = { title: "Investigation report" };

export default async function CaseReportPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseReport caseId={caseId} />;
}
