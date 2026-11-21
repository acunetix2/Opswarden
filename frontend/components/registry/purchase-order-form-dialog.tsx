"use client";

import { Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/documents";
import { formatBytes } from "@/lib/format";
import type { PurchaseOrder, PurchaseOrderInput, PurchaseOrderStatus, RegisteredSupplier } from "@/lib/types";
import { ACCEPT_ATTR, precheckFile } from "@/lib/upload-rules";
import {
  useCreatePurchaseOrderMutation,
  useRegisteredSuppliersQuery,
  useUpdatePurchaseOrderMutation,
  useUploadPurchaseOrderFileMutation,
} from "@/store/api";
import { useToast } from "@/store/hooks";

import { SupplierFormDialog } from "./supplier-form-dialog";

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  open: "Open",
  received: "Goods received",
  closed: "Closed",
  cancelled: "Cancelled",
};

interface PurchaseOrderFormDialogProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  purchaseOrder?: PurchaseOrder | null;
  /** Preselect a supplier for a new PO. */
  supplierId?: string | null;
  initialNumber?: string;
  maxBytes?: number;
  onSaved?: (po: PurchaseOrder) => void;
}

/** Register or edit a purchase order, optionally with its file (attached to cases opened from it). */
export function PurchaseOrderFormDialog({ workspaceId, open, onClose, purchaseOrder, supplierId, initialNumber, maxBytes, onSaved }: PurchaseOrderFormDialogProps) {
  const toast = useToast();
  const { data: suppliers, isLoading } = useRegisteredSuppliersQuery({ workspaceId });
  const [create] = useCreatePurchaseOrderMutation();
  const [update] = useUpdatePurchaseOrderMutation();
  const [upload] = useUploadPurchaseOrderFileMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const switchingRef = useRef(false);

  const [form, setForm] = useState<PurchaseOrderInput>({ supplier_id: "", po_number: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newSupplierName, setNewSupplierName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    setForm(
      purchaseOrder
        ? {
            supplier_id: purchaseOrder.supplier_id,
            po_number: purchaseOrder.po_number,
            order_date: purchaseOrder.order_date ?? "",
            expected_delivery_date: purchaseOrder.expected_delivery_date ?? "",
            currency: purchaseOrder.currency,
            total_amount: purchaseOrder.total_amount ?? "",
            description: purchaseOrder.description ?? "",
            status: purchaseOrder.status,
          }
        : { supplier_id: supplierId ?? "", po_number: initialNumber ?? "", order_date: new Date().toISOString().slice(0, 10), currency: "", total_amount: "", description: "", status: "open" },
    );
  }, [open, purchaseOrder, supplierId, initialNumber]);

  const supplierOptions = useMemo(
    () =>
      (suppliers ?? []).map((s: RegisteredSupplier) => ({
        value: s.id,
        label: s.name,
        hint: [s.supplier_code, s.contact_email].filter(Boolean).join(" · ") || undefined,
        keywords: `${s.supplier_code ?? ""} ${s.contact_email ?? ""}`,
      })),
    [suppliers],
  );
  const chosen = suppliers?.find((s) => s.id === form.supplier_id);
  const set = <K extends keyof PurchaseOrderInput>(k: K, v: PurchaseOrderInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const currency = form.currency || chosen?.default_currency || "USD";
  const amountBad = Boolean(form.total_amount && !/^\d{1,3}(,?\d{3})*(\.\d{1,4})?$|^\d+(\.\d{1,4})?$/.test(form.total_amount.trim()));

  async function save() {
    setError(null);
    if (!form.supplier_id) return setError("Choose the supplier.");
    if (!form.po_number.trim()) return setError("Enter the PO number.");
    if (amountBad) return setError("Enter the total as a number, e.g. 1250.00.");
    if (file) {
      const problem = precheckFile(file, maxBytes);
      if (problem) return setError(problem);
    }
    const body: PurchaseOrderInput = {
      supplier_id: form.supplier_id,
      po_number: form.po_number.trim(),
      order_date: form.order_date || null,
      expected_delivery_date: form.expected_delivery_date || null,
      currency,
      total_amount: form.total_amount?.trim() || null,
      description: form.description?.trim() || null,
      status: form.status ?? "open",
    };
    try {
      let saved = purchaseOrder ? await update({ poId: purchaseOrder.id, body }).unwrap() : await create({ workspaceId, body }).unwrap();
      if (file) saved = await upload({ poId: saved.id, file }).unwrap();
      toast("success", purchaseOrder ? "Purchase order updated" : `${saved.po_number} registered`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={open && newSupplierName === null}
        title={purchaseOrder ? `Edit ${purchaseOrder.po_number}` : "Register a purchase order"}
        description="Attach the PO file and every case opened from this order starts with it already on file."
        confirmLabel={purchaseOrder ? "Save changes" : "Register purchase order"}
        confirmDisabled={!form.supplier_id || !form.po_number.trim() || amountBad}
        onConfirm={save}
        onClose={() => {
          // Hiding this dialog to show "Register supplier" fires close too; that isn't the user closing it.
          if (!switchingRef.current) onClose();
        }}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Supplier" htmlFor="po-supplier" required>
          <Combobox
            id="po-supplier"
            value={form.supplier_id || null}
            options={supplierOptions}
            loading={isLoading}
            onChange={(v) => set("supplier_id", v ?? "")}
            placeholder="Search registered suppliers"
            emptyText="No registered suppliers yet"
            onCreate={(name) => {
              switchingRef.current = true;
              setNewSupplierName(name);
            }}
            createLabel={(t) => `Register “${t}” as a new supplier`}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PO number" htmlFor="po-number" required>
            <Input id="po-number" value={form.po_number} maxLength={100} onChange={(e) => set("po_number", e.target.value)} placeholder="e.g. PO-2231" />
          </Field>
          <Field label="Status" htmlFor="po-status">
            <Select id="po-status" value={form.status ?? "open"} onChange={(e) => set("status", e.target.value as PurchaseOrderStatus)}>
              {(Object.keys(PO_STATUS_LABEL) as PurchaseOrderStatus[]).map((s) => (
                <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order date" htmlFor="po-date">
            <DatePicker
              id="po-date"
              value={form.order_date}
              onChange={(v) => {
                set("order_date", v);
                // A delivery date before the new order date no longer makes sense.
                if (v && form.expected_delivery_date && form.expected_delivery_date < v) set("expected_delivery_date", null);
              }}
              placeholder="Pick the order date"
            />
          </Field>
          <Field label="Expected delivery" htmlFor="po-delivery">
            <DatePicker
              id="po-delivery"
              value={form.expected_delivery_date}
              onChange={(v) => set("expected_delivery_date", v)}
              min={form.order_date || null}
              placeholder="Optional"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field label="Currency" htmlFor="po-currency">
            <Select id="po-currency" value={currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Order total" htmlFor="po-total" error={amountBad ? "Use a number, e.g. 1250.00." : null}>
            <Input id="po-total" inputMode="decimal" value={form.total_amount ?? ""} onChange={(e) => set("total_amount", e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <Field label="What was ordered" htmlFor="po-desc" hint="A short description for the register, e.g. 30 boxes of A4 paper, 6 toner cartridges.">
          <Textarea id="po-desc" value={form.description ?? ""} rows={2} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div>
          <p className="label mb-1.5 text-ink-2">PO file</p>
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose the purchase order file" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-[10px] border border-dashed border-line-strong px-3 py-3 text-left hover:bg-surface-muted/60"
          >
            <Paperclip className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink">
                {file ? file.name : purchaseOrder?.has_file ? `${purchaseOrder.original_filename} (attached)` : "Attach the PO (PDF, scan, photo or export)"}
              </span>
              <span className="block text-[12px] text-ink-3">
                {file ? formatBytes(file.size) : purchaseOrder?.has_file ? "Choose a file to replace it" : "Optional, but it saves uploading it on every case"}
              </span>
            </span>
          </button>
        </div>
      </ConfirmDialog>

      <SupplierFormDialog
        workspaceId={workspaceId}
        open={newSupplierName !== null}
        initialName={newSupplierName ?? ""}
        onClose={() => {
          setNewSupplierName(null);
          window.setTimeout(() => {
            switchingRef.current = false;
          }, 0);
        }}
        onSaved={(s) => set("supplier_id", s.id)}
      />
    </>
  );
}
