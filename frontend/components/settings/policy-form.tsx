"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import type { WorkspaceSettings } from "@/lib/types";
import { useUpdateSettingsMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

const DECIMAL_RE = /^\d+(\.\d{1,4})?$/;

interface FormState {
  workspace_name: string;
  price_tolerance: string;
  quantity_tolerance: string;
  reviewers_can_approve: boolean;
}

function fromSettings(s: WorkspaceSettings): FormState {
  return {
    workspace_name: s.workspace_name,
    price_tolerance: s.price_tolerance,
    quantity_tolerance: s.quantity_tolerance,
    reviewers_can_approve: s.reviewers_can_approve,
  };
}

/** Admin-editable workspace policy. Values are validated again on the server. */
export function PolicyForm({ settings }: { settings: WorkspaceSettings }) {
  const toast = useToast();
  const [save, { isLoading }] = useUpdateSettingsMutation();
  const [form, setForm] = useState<FormState>(() => fromSettings(settings));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(fromSettings(settings)), [settings]);

  const initial = fromSettings(settings);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);
  const priceErr = DECIMAL_RE.test(form.price_tolerance.trim()) ? null : "Use a number with up to 4 decimals, e.g. 0.01.";
  const qtyErr = DECIMAL_RE.test(form.quantity_tolerance.trim()) ? null : "Use a number with up to 4 decimals, e.g. 0.";
  const nameErr = form.workspace_name.trim() ? null : "Workspace name can't be empty.";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (priceErr || qtyErr || nameErr) return;
    try {
      await save({
        workspaceId: settings.workspace_id,
        body: {
          workspace_name: form.workspace_name.trim(),
          price_tolerance: form.price_tolerance.trim(),
          quantity_tolerance: form.quantity_tolerance.trim(),
          reviewers_can_approve: form.reviewers_can_approve,
        },
      }).unwrap();
      toast("success", "Settings saved", "New tolerances apply the next time a case is analyzed.");
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Workspace name" htmlFor="ws-name" error={nameErr}>
        <Input id="ws-name" value={form.workspace_name} maxLength={200} onChange={(e) => setForm({ ...form, workspace_name: e.target.value })} aria-invalid={Boolean(nameErr) || undefined} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Unit price tolerance" htmlFor="price-tol" error={priceErr} hint="Price differences up to this amount aren't flagged.">
          <Input id="price-tol" inputMode="decimal" value={form.price_tolerance} onChange={(e) => setForm({ ...form, price_tolerance: e.target.value })} className="tabular" aria-invalid={Boolean(priceErr) || undefined} aria-describedby={priceErr ? "price-tol-error" : "price-tol-hint"} />
        </Field>
        <Field label="Quantity tolerance (units)" htmlFor="qty-tol" error={qtyErr} hint="Quantity differences up to this many units aren't flagged.">
          <Input id="qty-tol" inputMode="decimal" value={form.quantity_tolerance} onChange={(e) => setForm({ ...form, quantity_tolerance: e.target.value })} className="tabular" aria-invalid={Boolean(qtyErr) || undefined} aria-describedby={qtyErr ? "qty-tol-error" : "qty-tol-hint"} />
        </Field>
      </div>
      <Checkbox
        className="rounded-[10px] border border-line bg-canvas/60 p-3.5"
        checked={form.reviewers_can_approve}
        onChange={(v) => setForm({ ...form, reviewers_can_approve: v })}
        label="Reviewers may approve and run external actions"
        description="When off, only admins can approve supplier letters. Approval itself can't be switched off."
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button type="submit" loading={isLoading} disabled={!dirty || Boolean(priceErr || qtyErr || nameErr)}>
          Save policy
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setForm(initial)}>
          Discard
        </Button>
        {dirty ? <span className="label text-brand-ink">Unsaved changes</span> : null}
        {settings.policy_updated_at ? (
          <span className="ml-auto font-mono text-[11px] text-ink-3">
            Last changed {formatDateTime(settings.policy_updated_at)}
            {settings.policy_updated_by_name ? ` by ${settings.policy_updated_by_name}` : ""}
          </span>
        ) : null}
      </div>
    </form>
  );
}
