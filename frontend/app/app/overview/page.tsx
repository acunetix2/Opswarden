import type { Metadata } from "next";

import { OverviewView } from "@/components/dashboard/overview-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function OverviewPage() {
  return <OverviewView />;
}
