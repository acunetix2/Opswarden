"use client";

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/documents";
import type { RegisteredSupplier, SupplierInput } from "@/lib/types";
import { useCreateSupplierMutation, useUpdateSupplierMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(name = ""): SupplierInput {
  return { name, supplier_code: "", contact_name: "", contact_email: "", phone: "", default_currency: "USD", payment_terms: "", address: "", notes: "", is_active: true };
}

interface SupplierFormDialogProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  /** Edit this supplier; omit to register a new one. */
  supplier?: RegisteredSupplier | null;
  /** Prefill the name when registering from a search box. */
  initialName?: string;
  onSaved?: (supplier: RegisteredSupplier) => void;
}

/** Register or edit a supplier. The contact email is used to address supplier letters. */
export function SupplierFormDialog({ workspaceId, open, onClose, supplier, initialName, onSaved }: SupplierFormDialogProps) {
  const toast = useToast();
  const [create] = useCreateSupplierMutation();
  const [update] = useUpdateSupplierMutation();
  const [form, setForm] = useState<SupplierInput>(blank());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      supplier
        ? {
            name: supplier.name,
            supplier_code: supplier.supplier_code ?? "",
            contact_name: supplier.contact_name ?? "",
            contact_email: supplier.contact_email ?? "",
            phone: supplier.phone ?? "",
            default_currency: supplier.default_currency,
            payment_terms: supplier.payment_terms ?? "",
            address: supplier.address ?? "",
            notes: supplier.notes ?? "",
            is_active: supplier.is_active,
          }
        : blank(initialName ?? ""),
    );
  }, [open, supplier, initialName]);

  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const email = (form.contact_email ?? "").trim();
  const emailBad = email !== "" && !EMAIL_RE.test(email);

  async function save() {
    setError(null);
    if (!form.name.trim()) return setError("Enter the supplier's name.");
    if (emailBad) return setError("Enter a valid contact email, or leave it blank.");
    const body: SupplierInput = {
      ...form,
      name: form.name.trim(),
      contact_email: email || null,
      supplier_code: form.supplier_code?.trim() || null,
      contact_name: form.contact_name?.trim() || null,
      phone: form.phone?.trim() || null,
      payment_terms: form.payment_terms?.trim() || null,
      address: form.address?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    try {
      const saved = supplier ? await update({ supplierId: supplier.id, body }).unwrap() : await create({ workspaceId, body }).unwrap();
      toast("success", supplier ? "Supplier updated" : `${saved.name} registered`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={supplier ? `Edit ${supplier.name}` : "Register a supplier"}
      description="Registered suppliers can be picked when opening a case. The contact email addresses supplier letters, which still need approval before anything is sent."
      confirmLabel={supplier ? "Save changes" : "Register supplier"}
      confirmDisabled={!form.name.trim() || emailBad}
      onConfirm={save}
      onClose={onClose}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Supplier name" htmlFor="sup-name" required>
          <Input id="sup-name" value={form.name} maxLength={300} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Supplier code" htmlFor="sup-code">
          <Input id="sup-code" value={form.supplier_code ?? ""} maxLength={100} onChange={(e) => set("supplier_code", e.target.value)} placeholder="e.g. V-1024" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="sup-contact">
          <Input id="sup-contact" value={form.contact_name ?? ""} maxLength={200} onChange={(e) => set("contact_name", e.target.value)} />
        </Field>
        <Field label="Contact email" htmlFor="sup-email" error={emailBad ? "Enter a valid email address." : null} hint="Used for supplier letters.">
          <Input id="sup-email" type="email" value={form.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="accounts@supplier.com" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Phone" htmlFor="sup-phone">
          <Input id="sup-phone" value={form.phone ?? ""} maxLength={50} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Currency" htmlFor="sup-currency">
          <Select id="sup-currency" value={form.default_currency} onChange={(e) => set("default_currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment terms" htmlFor="sup-terms">
          <Input id="sup-terms" value={form.payment_terms ?? ""} maxLength={100} onChange={(e) => set("payment_terms", e.target.value)} placeholder="e.g. Net 30" />
        </Field>
      </div>
      <Field label="Address" htmlFor="sup-address">
        <Textarea id="sup-address" value={form.address ?? ""} rows={2} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="Internal notes" htmlFor="sup-notes" hint="Visible to your workspace only.">
        <Textarea id="sup-notes" value={form.notes ?? ""} rows={2} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      {supplier ? (
        <Checkbox
          checked={form.is_active ?? true}
          onChange={(v) => set("is_active", v)}
          label="Active supplier"
          description="Inactive suppliers are hidden from pickers but keep their history."
        />
      ) : null}
    </ConfirmDialog>
  );
}
