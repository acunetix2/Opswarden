import type { Metadata } from "next";

import { ExposureView } from "@/components/insights/exposure-view";

export const metadata: Metadata = { title: "Exposure" };

export default function ExposurePage() {
  return <ExposureView />;
}