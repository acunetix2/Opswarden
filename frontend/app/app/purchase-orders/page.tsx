import type { Metadata } from "next";
import { Suspense } from "react";

import { PurchaseOrdersView } from "@/components/registry/purchase-orders-view";

export const metadata: Metadata = { title: "Purchase orders" };

export default function PurchaseOrdersPage() {
  return (
    <Suspense>
      <PurchaseOrdersView />
    </Suspense>
  );
}
