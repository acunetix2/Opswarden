"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import type { Invitation, Role } from "@/lib/types";
import { useCreateInvitationMutation } from "@/store/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} aria-label="Link" className="h-8 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        size="sm"
        variant="secondary"
        icon={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
      >
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}

export function InviteDialog({ workspaceId, open, onClose }: { workspaceId: string; open: boolean; onClose: () => void }) {
  const [create] = useCreateInvitationMutation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("contributor");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invitation | null>(null);

  function close() {
    setEmail("");
    setRole("contributor");
    setError(null);
    setCreated(null);
    onClose();
  }

  const invalid = email.trim() !== "" && !EMAIL_RE.test(email.trim());

  if (created) {
    return (
      <ConfirmDialog open={open} title="Invitation created" confirmLabel="Done" onConfirm={close} onClose={close}>
        <p className="text-[13px] text-ink-2">
          {created.email_sent
            ? `We emailed ${created.email} an invitation.`
            : `Email isn't connected, so send ${created.email} this one-time link yourself.`}{" "}
          It expires in 7 days and can be revoked from the pending list.
        </p>
        {created.invite_url ? <CopyLink url={created.invite_url} /> : null}
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open={open}
      title="Invite a teammate"
      description="They'll join this workspace with the role you choose. You can change it later."
      confirmLabel="Create invitation"
      confirmDisabled={!EMAIL_RE.test(email.trim())}
      onClose={close}
      onConfirm={async () => {
        setError(null);
        try {
          setCreated(await create({ workspaceId, email: email.trim(), role }).unwrap());
        } catch (err) {
          setError(toAppError(err).message);
        }
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Email" htmlFor="invite-email" error={invalid ? "Enter a valid email address." : null}>
        <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={invalid || undefined} />
      </Field>
      <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role].summary}>
        <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-describedby="invite-role-hint">
          {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_DESCRIPTIONS[r].label}</option>
          ))}
        </Select>
      </Field>
    </ConfirmDialog>
  );
}
