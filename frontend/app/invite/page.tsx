import type { Metadata } from "next";
import { Suspense } from "react";

import { AcceptInviteView } from "@/components/auth/accept-invite-view";

export const metadata: Metadata = { title: "Accept invitation" };

export default function InvitePage() {
  return (
    <Suspense>
      <AcceptInviteView />
    </Suspense>
  );
}
