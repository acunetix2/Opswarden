"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import type { WorkspaceSettings, WorkspaceSettingsUpdate } from "@/lib/types";
import { useUpdateSettingsMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

type Flag = "auto_register" | "auto_draft_letters" | "auto_resolve_clean" | "notify_reviewers" | "send_on_approval";

const FLAGS: { key: Flag; label: string; description: string; needsEmail?: boolean }[] = [
  {
    key: "auto_register",
    label: "Save suppliers and purchase orders from documents",
    description: "New suppliers, their contact details and PO numbers read from documents are added to the register. Entries you typed are never overwritten.",
  },
  {
    key: "auto_resolve_clean",
    label: "Close cases where all three documents agree",
    description: "Recorded as \"No discrepancy\" in the activity log. Reopen a case at any time.",
  },
  {
    key: "auto_draft_letters",
    label: "Draft the supplier letter after each analysis",
    description: "The letter goes to the approval queue. Nothing is sent until an approver approves the exact text.",
  },
  {
    key: "notify_reviewers",
    label: "Email reviewers when a letter or a review is waiting",
    description: "At most one email per case per hour.",
    needsEmail: true,
  },
  {
    key: "send_on_approval",
    label: "Send the letter as soon as it is approved",
    description: "Approving a letter emails it to the supplier at once. Every send check still runs: permission, unchanged text and a recipient.",
    needsEmail: true,
  },
];

/** What OpsWarden does on its own. Admins switch each behaviour; others see what is on. */
export function AutomationCard({ settings, canEdit }: { settings: WorkspaceSettings; canEdit: boolean }) {
  const toast = useToast();
  const [save] = useUpdateSettingsMutation();
  const [saving, setSaving] = useState<Flag | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: Flag, value: boolean) {
    setError(null);
    setSaving(key);
    try {
      const body: WorkspaceSettingsUpdate = { [key]: value };
      await save({ workspaceId: settings.workspace_id, body }).unwrap();
      toast("success", value ? "Turned on" : "Turned off", FLAGS.find((f) => f.key === key)?.label);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        index="04"
        title="Automation"
        description="What OpsWarden does after reading documents and running an analysis. People still approve every letter before it reaches a supplier."
      />
      <CardBody className="space-y-3 py-5">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!settings.email_configured ? (
          <Notice tone="info">Email isn't connected on this server, so reviewer emails and sending on approval are skipped.</Notice>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {FLAGS.map((f) => {
            const on = settings[f.key] ?? true;
            return canEdit ? (
              <Checkbox
                key={f.key}
                className="rounded-[10px] border border-line bg-canvas/60 p-3.5"
                checked={on}
                onChange={(v) => {
                  if (!saving) void toggle(f.key, v);
                }}
                label={
                  <>
                    {f.label}
                    {saving === f.key ? <span className="ml-2 text-[12px] font-normal text-ink-3">Saving…</span> : null}
                  </>
                }
                description={f.description}
              />
            ) : (
              <div key={f.key} className="rounded-[10px] border border-line bg-canvas/60 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13.5px] font-medium text-ink">{f.label}</p>
                  <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
                </div>
                <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{f.description}</p>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
