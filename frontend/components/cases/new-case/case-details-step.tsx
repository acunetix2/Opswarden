"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Paperclip } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { PurchaseOrderFormDialog } from "@/components/registry/purchase-order-form-dialog";
import { SupplierFormDialog } from "@/components/registry/supplier-form-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/documents";
import { formatDate, formatMoney } from "@/lib/format";
import type { Case, CaseCreate } from "@/lib/types";
import { useCreateCaseMutation, usePurchaseOrdersQuery, useRegisteredSuppliersQuery, useSettingsQuery, useUpdateCaseMutation } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

interface CaseDetailsStepProps {
  workspaceId: string;
  existing?: Case;
  onSaved: (caseId: string) => void;
}

const UNREGISTERED = "__typed__";

/**
 * Step 1. Pick a registered supplier and one of its purchase orders; supplier,
 * PO number and currency fill in, and a PO file on record is attached to the
 * case. Typing a name or PO number that isn't registered still works.
 */
export function CaseDetailsStep({ workspaceId, existing, onSaved }: CaseDetailsStepProps) {
  const params = useSearchParams();
  const { can } = useWorkspace();
  const canManage = can("manage_register");
  const [create, createState] = useCreateCaseMutation();
  const [update, updateState] = useUpdateCaseMutation();
  const { data: suppliers, isLoading: loadingSuppliers } = useRegisteredSuppliersQuery({ workspaceId });
  const { data: allPos, isLoading: loadingPos } = usePurchaseOrdersQuery({ workspaceId });
  const { data: settings } = useSettingsQuery(workspaceId);

  const [form, setForm] = useState<CaseCreate>({
    title: existing?.title ?? "",
    supplier_id: existing?.supplier_id ?? params.get("supplier") ?? null,
    supplier_name: existing?.supplier_name ?? "",
    purchase_order_id: existing?.purchase_order_id ?? params.get("po") ?? null,
    supplier_reference: existing?.supplier_reference ?? "",
    currency: existing?.currency ?? "USD",
    notes: existing?.notes ?? "",
  });
  const [titleTouched, setTitleTouched] = useState(Boolean(existing?.title));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registerSupplier, setRegisterSupplier] = useState<string | null>(null);
  const [registerPo, setRegisterPo] = useState<string | null>(null);

  const set = <K extends keyof CaseCreate>(key: K, value: CaseCreate[K]) => setForm((f) => ({ ...f, [key]: value }));

  const supplier = suppliers?.find((s) => s.id === form.supplier_id) ?? null;
  const po = allPos?.find((p) => p.id === form.purchase_order_id) ?? null;
  const supplierPos = useMemo(
    () => (allPos ?? []).filter((p) => (!form.supplier_id || p.supplier_id === form.supplier_id) && p.status !== "cancelled"),
    [allPos, form.supplier_id],
  );

  // Fill the rest of the form from the register as choices are made.
  useEffect(() => {
    if (supplier) setForm((f) => ({ ...f, supplier_name: supplier.name, currency: po?.currency ?? supplier.default_currency }));
  }, [supplier, po]);
  useEffect(() => {
    if (!po) return;
    setForm((f) => ({ ...f, supplier_id: po.supplier_id, supplier_name: po.supplier_name, supplier_reference: po.po_number, currency: po.currency }));
  }, [po]);
  useEffect(() => {
    if (titleTouched) return;
    const name = supplier?.name ?? form.supplier_name?.trim();
    const ref = po?.po_number ?? form.supplier_reference?.trim();
    setForm((f) => ({ ...f, title: ref && name ? `${ref} · ${name}` : name ? `${name} invoice check` : ref ?? "" }));
  }, [supplier, po, form.supplier_name, form.supplier_reference, titleTouched]);

  const supplierOptions: ComboOption[] = useMemo(() => {
    const opts: ComboOption[] = (suppliers ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      hint: [s.supplier_code, s.contact_email ?? "No contact email"].filter(Boolean).join(" · "),
      keywords: `${s.supplier_code ?? ""} ${s.contact_email ?? ""}`,
      aside: s.open_purchase_orders ? `${s.open_purchase_orders} open PO${s.open_purchase_orders === 1 ? "" : "s"}` : undefined,
    }));
    if (!form.supplier_id && form.supplier_name?.trim()) opts.unshift({ value: UNREGISTERED, label: form.supplier_name.trim(), hint: "Not registered" });
    return opts;
  }, [suppliers, form.supplier_id, form.supplier_name]);

  const poOptions: ComboOption[] = useMemo(() => {
    const opts: ComboOption[] = supplierPos.map((p) => ({
      value: p.id,
      label: p.po_number,
      hint: [form.supplier_id ? null : p.supplier_name, p.order_date ? formatDate(p.order_date) : null, p.has_file ? "file on record" : "no file"].filter(Boolean).join(" · "),
      keywords: `${p.supplier_name} ${p.description ?? ""}`,
      aside: p.total_amount ? formatMoney(p.total_amount, p.currency) : undefined,
    }));
    if (!form.purchase_order_id && form.supplier_reference?.trim()) opts.unshift({ value: UNREGISTERED, label: form.supplier_reference.trim(), hint: "Not registered" });
    return opts;
  }, [supplierPos, form.supplier_id, form.purchase_order_id, form.supplier_reference]);

  function chooseSupplier(v: string | null) {
    if (v === UNREGISTERED) return;
    setForm((f) => ({
      ...f,
      supplier_id: v,
      supplier_name: v ? (suppliers?.find((s) => s.id === v)?.name ?? "") : "",
      // A PO from a different supplier no longer fits.
      purchase_order_id: v && po && po.supplier_id !== v ? null : f.purchase_order_id,
      supplier_reference: v && po && po.supplier_id !== v ? "" : f.supplier_reference,
    }));
  }

  function choosePo(v: string | null) {
    if (v === UNREGISTERED) return;
    setForm((f) => ({ ...f, purchase_order_id: v, supplier_reference: v ? f.supplier_reference : "" }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() && !form.purchase_order_id) {
      setTitleError("Give the case a short title.");
      return;
    }
    setTitleError(null);
    const body: CaseCreate = {
      title: form.title.trim(),
      supplier_id: form.supplier_id || null,
      purchase_order_id: form.purchase_order_id || null,
      supplier_name: form.supplier_name?.trim() || null,
      supplier_reference: form.supplier_reference?.trim() || null,
      currency: form.currency,
      notes: form.notes?.trim() || null,
    };
    try {
      const saved = existing ? await update({ caseId: existing.id, body }).unwrap() : await create({ workspaceId, body }).unwrap();
      onSaved(saved.id);
    } catch (err) {
      setError(toAppError(err).message);
    }
  }

  const noRegister = !loadingSuppliers && !suppliers?.length;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {noRegister ? (
        <Notice tone="info" title="Start from your records">
          Register suppliers and purchase orders once, and new cases fill themselves in.{" "}
          {canManage ? (
            <Link href="/app/suppliers?new=1" className="font-medium text-brand-ink hover:underline">Register a supplier</Link>
          ) : (
            "Ask a reviewer or admin to register your suppliers."
          )}{" "}
          You can still type the details below.
        </Notice>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplier" hint={supplier ? (supplier.contact_email ? `Letters go to ${supplier.contact_email}` : "No contact email on record") : "Pick a registered supplier, or type a name."}>
          <Combobox
            id="supplier"
            value={form.supplier_id ?? (form.supplier_name?.trim() ? UNREGISTERED : null)}
            options={supplierOptions}
            loading={loadingSuppliers}
            onChange={chooseSupplier}
            placeholder="Search suppliers"
            emptyText="No registered suppliers match"
            onCreate={(name) => (canManage ? setRegisterSupplier(name) : setForm((f) => ({ ...f, supplier_id: null, supplier_name: name })))}
            createLabel={(t) => (canManage ? `Register “${t}” as a supplier` : `Use “${t}” without registering`)}
            aria-describedby="supplier-hint"
          />
        </Field>
        <Field label="Purchase order" htmlFor="po-ref" hint={po ? (po.has_file ? "PO file on record: it will be attached for you." : "No PO file on record: upload it in the next step.") : "Pick a registered PO, or type the number."}>
          <Combobox
            id="po-ref"
            value={form.purchase_order_id ?? (form.supplier_reference?.trim() ? UNREGISTERED : null)}
            options={poOptions}
            loading={loadingPos}
            onChange={choosePo}
            placeholder={form.supplier_id ? "Search this supplier's orders" : "Search purchase orders"}
            emptyText={form.supplier_id ? "No orders registered for this supplier" : "No purchase orders match"}
            onCreate={(num) => (canManage && form.supplier_id ? setRegisterPo(num) : setForm((f) => ({ ...f, purchase_order_id: null, supplier_reference: num })))}
            createLabel={(t) => (canManage && form.supplier_id ? `Register ${t} as a purchase order` : `Use “${t}” without registering`)}
            aria-describedby="po-ref-hint"
          />
        </Field>
      </div>

      {po ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[12px] border border-line bg-canvas/60 px-4 py-3 text-[13px]">
          <span className="font-mono font-medium text-ink">{po.po_number}</span>
          <span className="text-ink-2">{po.supplier_name}</span>
          {po.order_date ? <span className="text-ink-3">Ordered {formatDate(po.order_date)}</span> : null}
          {po.total_amount ? <span className="figure text-ink">{formatMoney(po.total_amount, po.currency)}</span> : null}
          {po.has_file ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Paperclip className="size-3.5" aria-hidden /> {po.original_filename}
            </span>
          ) : null}
          {po.case_count ? <span className="text-warning">Already has {po.case_count === 1 ? "a case" : `${po.case_count} cases`}</span> : null}
          {po.description ? <span className="basis-full text-[12.5px] text-ink-3">{po.description}</span> : null}
        </div>
      ) : null}

      <Field label="Case title" htmlFor="title" required={!form.purchase_order_id} error={titleError} hint="Filled in from the supplier and PO. Change it if you like.">
        <Input
          id="title"
          value={form.title}
          onChange={(e) => {
            setTitleTouched(true);
            set("title", e.target.value);
          }}
          aria-invalid={Boolean(titleError) || undefined}
          aria-describedby={titleError ? "title-error" : "title-hint"}
          maxLength={300}
        />
      </Field>
      <Field label="Currency" htmlFor="currency" hint={po ? "From the purchase order." : supplier ? "The supplier's usual currency." : "Used to label amounts in dispute."} className="sm:max-w-56">
        <Select id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} aria-describedby="currency-hint" disabled={Boolean(po)}>
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
          {existing ? "Save and continue" : po?.has_file ? "Create case with PO attached" : "Create draft and continue"}
        </Button>
      </div>

      <SupplierFormDialog
        workspaceId={workspaceId}
        open={registerSupplier !== null}
        initialName={registerSupplier ?? ""}
        onClose={() => setRegisterSupplier(null)}
        onSaved={(s) => chooseSupplier(s.id)}
      />
      <PurchaseOrderFormDialog
        workspaceId={workspaceId}
        open={registerPo !== null}
        initialNumber={registerPo ?? ""}
        supplierId={form.supplier_id}
        maxBytes={settings?.max_upload_bytes}
        onClose={() => setRegisterPo(null)}
        onSaved={(p) => choosePo(p.id)}
      />
    </form>
  );
}
