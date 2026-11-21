import type { Metadata } from "next";
import { Suspense } from "react";

import { InvestigationsView } from "@/components/cases/investigations-view";

export const metadata: Metadata = { title: "Investigations" };

export default function InvestigationsPage() {
  return (
    <Suspense>
      <InvestigationsView />
    </Suspense>
  );
}
