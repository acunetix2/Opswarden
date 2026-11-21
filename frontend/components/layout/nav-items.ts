import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  Archive,
  BarChart3,
  Bell,
  Building,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileSearch,
  FileText,
  FolderOpen,
  Home,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";

import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional key used to attach a live count badge. */
  badge?: "approvals" | "needsReview" | "openCases" | "notifications";
  /** Requires specific permission to see. */
  permission?: Permission;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Home",
    items: [
      { href: "/app/overview", label: "Dashboard", icon: Home },
      { href: "/app/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    label: "Cases",
    items: [
      { href: "/app/investigations", label: "All cases", icon: FolderOpen, badge: "openCases" },
      { href: "/app/investigations?status=needs_review", label: "Need review", icon: AlertCircle, badge: "needsReview" },
      { href: "/app/investigations?status=ready_for_approval", label: "Ready to approve", icon: CheckCircle2 },
      { href: "/app/investigations?status=resolved", label: "Resolved", icon: Archive },
    ],
  },
  {
    label: "Sign-off",
    items: [{ href: "/app/approvals", label: "Approvals", icon: FileCheck, badge: "approvals" }],
  },
  {
    label: "Records",
    items: [
      { href: "/app/suppliers", label: "Suppliers", icon: Building },
      { href: "/app/purchase-orders", label: "Purchase orders", icon: ClipboardList },
      { href: "/app/findings", label: "Findings", icon: FileSearch },
      { href: "/app/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/app/exposure", label: "Exposure", icon: TrendingUp },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/app/activity", label: "Activity log", icon: Activity, permission: "manage_workspace" },
      { href: "/app/team", label: "Team & access", icon: Users },
      { href: "/app/settings", label: "Settings", icon: Settings, permission: "manage_workspace" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Path portion of an item's href, without query string. */
function hrefPath(href: string) {
  return href.split("?")[0];
}

/**
 * Whether a nav item is the current page. Items that differ only by a
 * `?status=` filter match on that filter, so "All cases" is not lit up at the
 * same time as "Need review".
 */
export function isNavActive(item: NavItem, pathname: string, params: URLSearchParams): boolean {
  const [path, query] = item.href.split("?");
  const onPath = pathname === path || pathname.startsWith(`${path}/`);
  if (!onPath) return false;
  if (query) return new URLSearchParams(query).get("status") === params.get("status");
  const siblingFilters = NAV_ITEMS.some((i) => i !== item && hrefPath(i.href) === path && i.href.includes("?"));
  if (siblingFilters && pathname === path) {
    const status = params.get("status");
    return !NAV_ITEMS.some((i) => i.href.includes("?") && hrefPath(i.href) === path && new URLSearchParams(i.href.split("?")[1]).get("status") === status);
  }
  return true;
}
