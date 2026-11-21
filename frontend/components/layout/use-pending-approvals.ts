"use client";

import { useApprovalsQuery } from "@/store/api";
import { useSession } from "@/store/hooks";

/**
 * Pending approval count for nav chrome. Shares the RTK Query cache with the
 * approvals page, so deciding an approval updates the badge automatically.
 */
export function usePendingApprovals(): number {
  const { workspace } = useSession();
  const { data } = useApprovalsQuery(
    { workspaceId: workspace?.id ?? "", status: "pending" },
    { skip: !workspace, pollingInterval: 60_000 },
  );
  return data?.length ?? 0;
}
