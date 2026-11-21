import type { Metadata } from "next";
import { Suspense } from "react";

import { NewCaseWizard } from "@/components/cases/new-case/new-case-wizard";

export const metadata: Metadata = { title: "New investigation" };

export default function NewInvestigationPage() {
  return (
    <Suspense>
      <NewCaseWizard />
    </Suspense>
  );
}
