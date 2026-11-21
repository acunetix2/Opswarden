import type { Metadata } from "next";
import { Suspense } from "react";

import { EvidenceViewer } from "@/components/documents/evidence-viewer";

export const metadata: Metadata = { title: "Evidence" };

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return (
    <Suspense>
      <EvidenceViewer documentId={documentId} />
    </Suspense>
  );
}
