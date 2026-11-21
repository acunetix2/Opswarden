import type { Metadata } from "next";

import { EmailPageView } from "@/components/cases/email/email-page-view";

export const metadata: Metadata = { title: "Supplier email" };

export default async function CaseEmailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <EmailPageView caseId={caseId} />;
}
