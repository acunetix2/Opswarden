import type { Metadata } from "next";

import { IntakeView } from "@/components/intake/intake-view";

export const metadata: Metadata = { title: "Drop documents" };

export default function IntakePage() {
  return <IntakeView />;
}
