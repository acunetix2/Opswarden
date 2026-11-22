import type { Metadata } from "next";

import { LandingView } from "@/components/landing/landing-view";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: { absolute: "OpsWarden: procurement investigations with people in control" },
  description: "Three-way matching for purchase orders, delivery receipts and invoices, with evidence on every finding and a person approving every next step.",
};

export default function Home() {
  return (
    <MarketingShell overlayHeader>
      <LandingView />
    </MarketingShell>
  );
}
