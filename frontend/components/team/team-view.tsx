"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { can, ROLE_DESCRIPTIONS, type Permission } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { useInvitationsQuery, useMembersQuery, useRevokeInvitationMutation, useSettingsQuery } from "@/store/api";
import { useToast, useWorkspace } from "@/store/hooks";

import { InviteDialog } from "./invite-dialog";
import { MemberRow } from "./member-row";

const ROLES: Role[] = ["admin", "reviewer", "contributor"];
const MATRIX: { label: string; permission: Permission | null; policy?: boolean }[] = [
  { label: "View cases and evidence", permission: null },
  { label: "Create cases, upload documents", permission: "create_case" },
  { label: "Correct extracted fields", permission: "correct_fields" },
  { label: "Confirm or dismiss findings", permission: "review_finding" },
  { label: "Archive and reopen cases", permission: "review_finding" },
  { label: "Request approval for letters", permission: "request_approval" },
  { label: "Approve and run external actions", permission: "decide_approval", policy: true },
  { label: "Manage members, policy, audit log", permission: "manage_workspace" },
];

export function TeamView() {
  const toast = useToast();
  const { workspace, user, can: userCan } = useWorkspace();
  const canManage = userCan("manage_workspace");
  const members = useMembersQuery(workspace.id);
  const invitations = useInvitationsQuery(workspace.id, { skip: !canManage });
  const { data: settings } = useSettingsQuery(workspace.id);
  const [revoke] = useRevokeInvitationMutation();
  const [inviteOpen, setInviteOpen] = useState(false);

  const admins = (members.data ?? []).filter((m) => m.role === "admin").length;
  const reviewersMayApprove = settings?.reviewers_can_approve ?? true;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Access"
        title="Team & access"
        description={`Who works in ${workspace.name}, and what each role is allowed to do. Enforced on the server for every request.`}
        actions={
          canManage ? (
            <Button variant="accent" icon={<Plus className="size-4" aria-hidden />} onClick={() => setInviteOpen(true)}>
              Invite teammate
            </Button>
          ) : (
            <span className="label">Only admins can invite or change members</span>
          )
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Card>
            <CardHeader
              index="01"
              title="Roster"
              description={members.data ? `${members.data.length} people · ${admins} admin${admins === 1 ? "" : "s"}` : undefined}
            />
            {members.isLoading ? (
              <SkeletonRows rows={3} className="px-5" />
            ) : members.error && !members.data ? (
              <ErrorState error={members.error} onRetry={members.refetch} />
            ) : !members.data?.length ? (
              <EmptyState title="No members" />
            ) : (
              <ul className="divide-y divide-line">
                {members.data.map((m) => (
                  <MemberRow key={m.user_id} member={m} workspaceId={workspace.id} isSelf={m.user_id === user.id} canManage={canManage} isLastAdmin={admins <= 1} />
                ))}
              </ul>
            )}
          </Card>

          {canManage ? (
            <Card>
              <CardHeader index="02" title="Pending invitations" description="Single-use links that expire after 7 days." />
              {invitations.isLoading ? (
                <SkeletonRows rows={2} className="px-5" />
              ) : !invitations.data?.length ? (
                <EmptyState title="No pending invitations" />
              ) : (
                <ul className="divide-y divide-line">
                  {invitations.data.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[12.5px] text-ink">{i.email}</p>
                        <p className="text-[12px] text-ink-3">
                          {ROLE_DESCRIPTIONS[i.role].label} · invited by {i.invited_by_name ?? "an admin"} · expires {formatDate(i.expires_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          revoke(i.id)
                            .unwrap()
                            .then(() => toast("success", "Invitation revoked"))
                            .catch((e) => toast("danger", "Couldn't revoke", toAppError(e).message))
                        }
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader index="03" title="Who can do what" description="● allowed · — not allowed" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Permissions by role</caption>
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  <th scope="col" className="label px-5 py-2.5 text-left font-medium">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col" className={cn("label px-3 py-2.5 text-center font-medium", r === workspace.role && "text-brand-ink")}>
                      {ROLE_DESCRIPTIONS[r].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {MATRIX.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="px-5 py-2.5 text-left font-normal text-ink-2">{row.label}</th>
                    {ROLES.map((r) => {
                      let ok = row.permission === null || can(r, row.permission);
                      const byPolicy = row.policy && r === "reviewer";
                      if (byPolicy) ok = ok && reviewersMayApprove;
                      return (
                        <td key={r} className={cn("px-3 py-2.5 text-center font-mono", r === workspace.role && "bg-brand-tint/60")}>
                          <span className={ok ? "text-ink" : "text-ink-3"}>{ok ? "●" : "—"}</span>
                          <span className="sr-only">{ok ? "Allowed" : "Not allowed"}</span>
                          {byPolicy ? <span className="block text-[9.5px] uppercase tracking-[0.06em] text-ink-3">policy</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage ? (
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
              Whether reviewers may approve is set in{" "}
              <Link href="/app/settings" className="font-medium text-brand-ink hover:underline">Settings</Link>.
            </p>
          ) : null}
        </Card>
      </div>

      <InviteDialog workspaceId={workspace.id} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
