"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, FolderSearch, Paperclip, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/types";
import { API_URL, useCreateCaseMutation, usePurchaseOrdersQuery, useRegisteredSuppliersQuery, useSettingsQuery } from "@/store/api";
import { useAppSelector, useToast, useWorkspace } from "@/store/hooks";

import { PO_STATUS_LABEL, PurchaseOrderFormDialog } from "./purchase-order-form-dialog";

const STATUS_TONE: Record<PurchaseOrderStatus, Tone> = { open: "info", received: "warning", closed: "success", cancelled: "neutral" };

/** Purchase-order register. Opening a case from a PO fills in the supplier and attaches the PO file. */
export function PurchaseOrdersView() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const token = useAppSelector((s) => s.session.token);
  const { workspace, can } = useWorkspace();
  const canManage = can("manage_register");
  const canCreate = can("create_case");
  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const focusId = params.get("po");

  const { data, error, isLoading, refetch } = usePurchaseOrdersQuery({ workspaceId: workspace.id, supplierId: supplierId || undefined, status: status || undefined });
  const { data: suppliers } = useRegisteredSuppliersQuery({ workspaceId: workspace.id });
  const { data: settings } = useSettingsQuery(workspace.id);
  const [createCase] = useCreateCaseMutation();

  useEffect(() => {
    if (params.get("new") === "1" && canManage) setAdding(true);
  }, [params, canManage]);
  useEffect(() => {
    if (focusId) document.getElementById(`po-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => !q || `${p.po_number} ${p.supplier_name} ${p.description ?? ""}`.toLowerCase().includes(q));
  }, [data, search]);

  async function openCase(po: PurchaseOrder) {
    setOpening(po.id);
    try {
      const c = await createCase({ workspaceId: workspace.id, body: { title: "", currency: po.currency, purchase_order_id: po.id } }).unwrap();
      toast("success", `${c.case_number} opened`, po.has_file ? "The PO is already on file. Add the invoice and delivery receipt." : "Add the PO, invoice and delivery receipt.");
      router.push(`/app/investigations/new?case=${c.id}&step=2`);
    } catch (err) {
      toast("danger", "Couldn't open the case", toAppError(err).message);
      setOpening(null);
    }
  }

  async function openFile(po: PurchaseOrder) {
    try {
      const res = await fetch(`${API_URL}/api/v1/registry/purchase-orders/${po.id}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast("danger", "Couldn't open the file");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Purchase orders"
        description="Record each order once, with its file. When the invoice or delivery comes in, open a case from the order and OpsWarden starts with the supplier and PO already in place."
        actions={
          canManage ? (
            <Button variant="accent" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)} disabled={!suppliers?.length && !isLoading}>
              Register purchase order
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="grid gap-4 border-b border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_14rem_11rem] lg:items-end">
          <div className="relative">
            <label htmlFor="po-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="po-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO number, supplier or description"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label htmlFor="po-filter-supplier" className="label">Supplier</label>
            <Select id="po-filter-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 h-9 text-[13px]">
              <option value="">All suppliers</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="po-filter-status" className="label">Status</label>
            <Select id="po-filter-status" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-9 text-[13px]">
              <option value="">Any status</option>
              {(Object.keys(PO_STATUS_LABEL) as PurchaseOrderStatus[]).map((s) => (
                <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={5} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No purchase orders match" : "No purchase orders registered yet"}
            description={
              data?.length
                ? "Try another filter."
                : suppliers?.length
                  ? "Register an order with its file, then open a case from it when the invoice arrives."
                  : "Register a supplier first, then record its purchase orders here."
            }
            action={
              canManage && !data?.length ? (
                suppliers?.length ? (
                  <Button variant="accent" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
                    Register a purchase order
                  </Button>
                ) : (
                  <Button variant="accent" size="sm" onClick={() => router.push("/app/suppliers?new=1")}>
                    Register a supplier
                  </Button>
                )
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Purchase orders</caption>
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  <th scope="col" className="label px-5 py-2.5 font-medium">Order</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Supplier</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Ordered</th>
                  <th scope="col" className="label px-3 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="label px-3 py-2.5 font-medium">Cases</th>
                  <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} id={`po-${p.id}`} className={cn("align-top transition-colors hover:bg-surface-muted/50", focusId === p.id && "bg-brand-tint/50")}>
                    <td className="px-5 py-3.5">
                      <span className="block font-mono text-[13px] font-medium text-ink">{p.po_number}</span>
                      {p.description ? <span className="mt-0.5 block max-w-72 truncate text-[12px] text-ink-3">{p.description}</span> : null}
                      {p.has_file ? (
                        <button type="button" onClick={() => void openFile(p)} className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-ink hover:underline">
                          <Paperclip className="size-3" aria-hidden /> {p.original_filename}
                        </button>
                      ) : (
                        <span className="mt-1 block text-[12px] text-ink-3">No file attached</span>
                      )}
                    </td>
                    <td className="max-w-56 truncate px-3 py-3.5 text-ink-2">
                      <Link href={`/app/suppliers?supplier=${p.supplier_id}`} className="hover:text-ink hover:underline">{p.supplier_name}</Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[12px] text-ink-3">
                      {formatDate(p.order_date)}
                      {p.expected_delivery_date ? <span className="block">due {formatDate(p.expected_delivery_date)}</span> : null}
                    </td>
                    <td className="figure whitespace-nowrap px-3 py-3.5 text-right text-ink">{p.total_amount ? formatMoney(p.total_amount, p.currency) : "—"}</td>
                    <td className="px-3 py-3.5"><Badge tone={STATUS_TONE[p.status]}>{PO_STATUS_LABEL[p.status]}</Badge></td>
                    <td className="px-3 py-3.5 text-[12.5px]">
                      {p.case_count && p.latest_case_id ? (
                        <Link href={`/app/investigations/${p.latest_case_id}`} className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
                          <FolderSearch className="size-3.5" aria-hidden /> {p.case_count === 1 ? "1 case" : `${p.case_count} cases`}
                        </Link>
                      ) : (
                        <span className="text-ink-3">None yet</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {canCreate && p.status !== "cancelled" ? (
                          <Button size="sm" variant="secondary" loading={opening === p.id} onClick={() => void openCase(p)} icon={<FileText className="size-3.5" aria-hidden />}>
                            Open case
                          </Button>
                        ) : null}
                        {canManage ? (
                          <button type="button" onClick={() => setEditing(p)} className="pressable rounded-[8px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink" aria-label={`Edit ${p.po_number}`} title="Edit">
                            <Pencil className="size-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PurchaseOrderFormDialog
        workspaceId={workspace.id}
        open={adding || Boolean(editing)}
        purchaseOrder={editing}
        supplierId={supplierId || null}
        maxBytes={settings?.max_upload_bytes}
        onClose={() => {
          setAdding(false);
          setEditing(null);
          if (params.get("new")) router.replace("/app/purchase-orders");
        }}
      />
    </div>
  );
}
