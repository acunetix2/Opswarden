"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { CountBadge } from "@/components/ui/badge";
import { SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { eventLabel, humanize, relativeTime } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";
import { useDismiss } from "@/lib/use-dismiss";
import { useMarkNotificationsReadMutation, useNotificationsQuery } from "@/store/api";
import { useSession } from "@/store/hooks";

function describe(n: NotificationItem): { title: string; detail: string | null; href: string } {
  const who = n.actor_type === "user" ? (n.actor_name ?? "Someone") : n.actor_type === "agent" ? "OpsWarden" : "System";
  const caseRef = n.case_number ? ` · ${n.case_number}` : "";
  const href = n.event_type.startsWith("approval.") ? "/app/approvals" : n.case_id ? `/app/investigations/${n.case_id}` : "/app/activity";
  switch (n.event_type) {
    case "approval.requested":
      return { title: `${who} requested approval for a supplier email`, detail: n.case_number, href };
    case "approval.decided":
      return { title: `${who} ${n.detail.decision === "approve" ? "approved" : "rejected"} a supplier email`, detail: n.case_number, href };
    case "investigation.completed":
      return {
        title: `Analysis finished${n.detail.status ? `: ${humanize(String(n.detail.status))}` : ""}`,
        detail: n.case_number,
        href,
      };
    case "member.joined":
      return { title: `${who} joined the workspace`, detail: n.detail.role ? humanize(n.detail.role) : null, href: "/app/team" };
    default:
      return { title: `${eventLabel(n.event_type)}${n.actor_type === "user" ? ` by ${who}` : ""}`, detail: caseRef ? n.case_number : null, href };
  }
}

/** Bell + panel. Reading the panel marks items as seen when it closes. */
export function NotificationsMenu() {
  const { workspace } = useSession();
  const workspaceId = workspace?.id ?? "";
  const { data, isLoading } = useNotificationsQuery(workspaceId, { skip: !workspace, pollingInterval: 30_000 });
  const [markRead] = useMarkNotificationsReadMutation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = data?.unread_count ?? 0;

  const close = useCallback(() => {
    setOpen(false);
    if (unread > 0 && workspaceId) void markRead(workspaceId);
  }, [unread, workspaceId, markRead]);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        className="pressable relative grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
        aria-label={unread > 0 ? `Notifications: ${unread} unread` : "Notifications"}
      >
        <Bell className="size-4" aria-hidden />
        <CountBadge count={unread} className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]" />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="pop-in absolute right-0 top-full z-40 mt-2 w-[min(92vw,26rem)] origin-top-right overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_16px_40px_rgb(17_17_17/0.14)]"
        >
          <div className="flex items-center justify-between border-b border-ink bg-ink px-4 py-2.5 text-canvas">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em]">Notifications{unread ? ` · ${unread} new` : ""}</p>
            {unread > 0 ? (
              <button type="button" className="pressable inline-flex items-center gap-1.5 text-[12px] text-canvas/65 hover:text-canvas" onClick={() => void markRead(workspaceId)}>
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            ) : null}
          </div>
          {isLoading ? (
            <SkeletonRows rows={3} className="px-4" />
          ) : !data?.items.length ? (
            <div className="px-4 py-8">
              <p className="text-[13px] font-medium text-ink">
                <span className="mr-2 font-mono text-ink-3">—</span>Nothing new
              </p>
              <p className="mt-1 pl-6 text-[12px] text-ink-3">Approvals, finished analyses, and team changes appear here.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {data.items.map((n) => {
                const d = describe(n);
                return (
                  <li key={n.id}>
                    <Link href={d.href} onClick={close} className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/70">
                      {n.unread ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
                      <span className="w-14 shrink-0 pt-0.5 font-mono text-[10.5px] uppercase text-ink-3">{relativeTime(n.created_at).replace(" ago", "")}</span>
                      <span className="min-w-0">
                        <span className={cn("block text-[13px] leading-snug", n.unread ? "font-medium text-ink" : "text-ink-2")}>
                          {n.unread ? <span className="sr-only">Unread: </span> : null}
                          {d.title}
                        </span>
                        {d.detail ? <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{d.detail}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line px-4 py-2.5 text-right">
            <Link href="/app/approvals" onClick={close} className="text-[12px] font-medium text-brand-ink hover:underline">
              Open approvals →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
