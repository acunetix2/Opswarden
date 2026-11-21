"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { toAppError } from "@/lib/api-error";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { usesSupabaseAuth } from "@/lib/supabase-auth";
import type { Member, Role } from "@/lib/types";
import { useMemberResetLinkMutation, useRemoveMemberMutation, useUpdateMemberRoleMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

import { RoleBadge } from "@/components/status/status-badges";

import { CopyLink } from "./invite-dialog";

interface MemberRowProps {
  member: Member;
  workspaceId: string;
  isSelf: boolean;
  canManage: boolean;
  isLastAdmin: boolean;
}

export function MemberRow({ member: m, workspaceId, isSelf, canManage, isLastAdmin }: MemberRowProps) {
  const toast = useToast();
  const [updateRole, roleState] = useUpdateMemberRoleMutation();
  const [remove] = useRemoveMemberMutation();
  const [issueReset] = useMemberResetLinkMutation();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const name = m.full_name || m.email;
  const editable = canManage && !isSelf;
  const locked = isLastAdmin && m.role === "admin";

  return (
    <li className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">
            {name}
            {isSelf ? <Badge tone="brand" className="ml-2 h-[18px] px-1.5 align-middle text-[10.5px]">You</Badge> : null}
          </p>
          <p className="truncate font-mono text-[11.5px] text-ink-3">{m.email} · since {formatDate(m.joined_at)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-12 sm:pl-0">
        {editable ? (
          <>
            <label htmlFor={`role-${m.user_id}`} className="sr-only">Role for {name}</label>
            <Select
              id={`role-${m.user_id}`}
              value={m.role}
              disabled={roleState.isLoading || locked}
              onChange={(e) => setPendingRole(e.target.value as Role)}
              className="h-8 w-36 text-[13px]"
              title={locked ? "A workspace needs at least one admin" : undefined}
            >
              {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_DESCRIPTIONS[r].label}</option>
              ))}
            </Select>
            {usesSupabaseAuth ? null : <Button size="sm" variant="ghost" aria-label={`Issue password reset link for ${name}`} onClick={async () => {
              try {
                setResetUrl((await issueReset({ workspaceId, userId: m.user_id }).unwrap()).reset_url);
              } catch (err) {
                toast("danger", "Couldn't create a reset link", toAppError(err).message);
              }
            }}>
              Reset link
            </Button>}
            <Button size="sm" variant="ghost" aria-label={`Remove ${name}`} title={locked ? "A workspace needs at least one admin" : undefined} disabled={locked} onClick={() => setRemoveOpen(true)}>
              Remove
            </Button>
          </>
        ) : (
          <RoleBadge role={m.role} />
        )}
      </div>

      <ConfirmDialog
        open={pendingRole !== null}
        title={`Change ${name}'s role?`}
        description={pendingRole ? `${ROLE_DESCRIPTIONS[pendingRole].label}: ${ROLE_DESCRIPTIONS[pendingRole].summary} Takes effect on their next request.` : undefined}
        confirmLabel="Change role"
        onClose={() => setPendingRole(null)}
        onConfirm={async () => {
          if (!pendingRole) return;
          try {
            await updateRole({ workspaceId, userId: m.user_id, role: pendingRole }).unwrap();
            toast("success", "Role updated");
          } catch (err) {
            toast("danger", "Couldn't change the role", toAppError(err).message);
          }
          setPendingRole(null);
        }}
      />
      <ConfirmDialog
        open={removeOpen}
        title={`Remove ${name}?`}
        description="They lose access to this workspace immediately. Their past actions stay in the audit trail."
        confirmLabel="Remove member"
        confirmVariant="danger"
        onClose={() => setRemoveOpen(false)}
        onConfirm={async () => {
          try {
            await remove({ workspaceId, userId: m.user_id }).unwrap();
            toast("success", `${name} was removed`);
          } catch (err) {
            toast("danger", "Couldn't remove the member", toAppError(err).message);
          }
          setRemoveOpen(false);
        }}
      />
      <ConfirmDialog open={resetUrl !== null} title={`Reset link for ${name}`} confirmLabel="Done" onClose={() => setResetUrl(null)} onConfirm={() => setResetUrl(null)}>
        <p className="text-[13px] text-ink-2">Share this one-time link with {name} privately. It expires in 30 minutes and replaces any earlier link.</p>
        {resetUrl ? <CopyLink url={resetUrl} /> : null}
      </ConfirmDialog>
    </li>
  );
}
