"use client";

import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/documents";
import type { Case, CaseCreate } from "@/lib/types";
import { useCreateCaseMutation, useUpdateCaseMutation } from "@/store/api";

interface CaseDetailsStepProps {
  workspaceId: string;
  existing?: Case;
  onSaved: (caseId: string) => void;
}

export function CaseDetailsStep({ workspaceId, existing, onSaved }: CaseDetailsStepProps) {
  const [create, createState] = useCreateCaseMutation();
  const [update, updateState] = useUpdateCaseMutation();
  const [form, setForm] = useState<CaseCreate>({
    title: existing?.title ?? "",
    supplier_name: existing?.supplier_name ?? "",
    supplier_reference: existing?.supplier_reference ?? "",
    currency: existing?.currency ?? "USD",
    notes: existing?.notes ?? "",
  });
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CaseCreate>(key: K, value: CaseCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setTitleError("Give the case a short title.");
      return;
    }
    setTitleError(null);
    const body: CaseCreate = {
      title: form.title.trim(),
      supplier_name: form.supplier_name?.trim() || null,
      supplier_reference: form.supplier_reference?.trim() || null,
      currency: form.currency,
      notes: form.notes?.trim() || null,
    };
    try {
      const saved = existing
        ? await update({ caseId: existing.id, body }).unwrap()
        : await create({ workspaceId, body }).unwrap();
      onSaved(saved.id);
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Case title" htmlFor="title" required error={titleError} hint="For example: Northstar invoice discrepancy">
        <Input
          id="title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={Boolean(titleError) || undefined}
          aria-describedby={titleError ? "title-error" : "title-hint"}
          maxLength={300}
          autoFocus
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplier" hint="Optional. Can be confirmed from the documents.">
          <Input id="supplier" value={form.supplier_name ?? ""} onChange={(e) => set("supplier_name", e.target.value)} maxLength={300} aria-describedby="supplier-hint" />
        </Field>
        <Field label="Purchase order reference" htmlFor="po-ref" hint="Optional, e.g. PO-1048.">
          <Input id="po-ref" value={form.supplier_reference ?? ""} onChange={(e) => set("supplier_reference", e.target.value)} maxLength={100} aria-describedby="po-ref-hint" />
        </Field>
      </div>
      <Field label="Currency" htmlFor="currency" hint="Used to label amounts in dispute." className="sm:max-w-56">
        <Select id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} aria-describedby="currency-hint">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Internal notes" htmlFor="notes" hint="Visible to your workspace only. Never sent to the supplier.">
        <Textarea id="notes" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} aria-describedby="notes-hint" />
      </Field>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-5">
        <ButtonLink href="/app/investigations" variant="ghost">Cancel</ButtonLink>
        <Button type="submit" loading={createState.isLoading || updateState.isLoading} iconRight={<ArrowRight className="size-4" aria-hidden />}>
          {existing ? "Save and continue" : "Create draft and continue"}
        </Button>
      </div>
    </form>
  );
}
