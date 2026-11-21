import { useMemo } from "react";

import { useApprovalsQuery, useCasesQuery, useNotificationsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

interface SidebarCounts {
  approvals: number;
  needsReview: number;
  openCases: number;
  notifications: number;
}

/**
 * Provides live counts for navigation badges.
 * Polls efficiently, caches aggressively.
 */
export function useSidebarCounts(): SidebarCounts {
  const { workspace } = useWorkspace();

  const { data: approvals } = useApprovalsQuery(
    { workspaceId: workspace.id },
    { pollingInterval: 30000 } // Refresh every 30s
  );

  const { data: cases } = useCasesQuery(
    { workspaceId: workspace.id },
    { pollingInterval: 60000 } // Refresh every 60s
  );

  const { data: notifications } = useNotificationsQuery(
    workspace.id,
    { pollingInterval: 30000 }
  );

  return useMemo(
    () => ({
      approvals: approvals?.filter((a) => a.status === "pending").length ?? 0,
      needsReview: cases?.filter((c) => c.status === "needs_review").length ?? 0,
      openCases: cases?.filter((c) => !["resolved", "archived"].includes(c.status)).length ?? 0,
      notifications: notifications?.unread_count ?? 0,
    }),
    [approvals, cases, notifications]
  );
}
