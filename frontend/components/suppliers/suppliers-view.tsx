"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Mail, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SupplierFormDialog } from "@/components/registry/supplier-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatMoneyValue, relativeTime } from "@/lib/format";
import { normalizeName } from "@/lib/registry";
import type { RegisteredSupplier } from "@/lib/types";
import { useImportSuppliersMutation, useRegisteredSuppliersQuery, useSuppliersQuery } from "@/store/api";
import { useToast, useWorkspace } from "@/store/hooks";

/** The supplier register: who you buy from, how to reach them, and how their cases stand. */
export function SuppliersView() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { workspace, can } = useWorkspace();
  const canManage = can("manage_register");
  const [showInactive, setShowInactive] = useState(false);
  const { data, error, isLoading, refetch } = useRegisteredSuppliersQuery({ workspaceId: workspace.id, includeInactive: showInactive });
  const { data: fromCases } = useSuppliersQuery(workspace.id);
  const [importFromCases, importState] = useImportSuppliersMutation();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RegisteredSupplier | null>(null);
  const [adding, setAdding] = useState(false);
  const focusId = params.get("supplier");

  useEffect(() => {
    if (params.get("new") === "1" && canManage) setAdding(true);
  }, [params, canManage]);
  useEffect(() => {
    if (focusId) document.getElementById(`supplier-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => !q || `${s.name} ${s.supplier_code ?? ""} ${s.contact_email ?? ""} ${s.contact_name ?? ""}`.toLowerCase().includes(q));
  }, [data, search]);

  // Suppliers named on cases but not registered yet.
  const unregistered = useMemo(() => {
    const known = new Set((data ?? []).map((s) => normalizeName(s.name)));
    return (fromCases ?? []).filter((s) => !known.has(normalizeName(s.name)));
  }, [data, fromCases]);

  async function onImport() {
    try {
      const r = await importFromCases(workspace.id).unwrap();
      toast("success", `${r.created} ${r.created === 1 ? "supplier" : "suppliers"} registered`, `${r.linked_cases} existing ${r.linked_cases === 1 ? "case is" : "cases are"} now linked.`);
    } catch (err) {
      toast("danger", "Couldn't import suppliers", toAppError(err).message);
    }
  }

  const missingEmail = (data ?? []).filter((s) => s.is_active && !s.contact_email).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Suppliers"
        description="Register the suppliers you buy from once. New cases pick them from this list, and supplier letters are addressed to the contact you record here."
        actions={
          canManage ? (
            <Button variant="accent" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Register supplier
            </Button>
          ) : null
        }
      />

      {canManage && unregistered.length ? (
        <Notice
          tone="info"
          title={`${unregistered.length} ${unregistered.length === 1 ? "supplier appears" : "suppliers appear"} on cases but ${unregistered.length === 1 ? "isn't" : "aren't"} registered`}
          action={
            <Button size="sm" variant="secondary" loading={importState.isLoading} onClick={onImport} icon={<Sparkles className="size-3.5" aria-hidden />}>
              Register all
            </Button>
          }
        >
          {unregistered.slice(0, 4).map((s) => s.name).join(", ")}
          {unregistered.length > 4 ? ` and ${unregistered.length - 4} more` : ""}. Registering links their existing cases too.
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div className="relative w-full max-w-md">
            <label htmlFor="sup-search" className="label">Search</label>
            <Search className="pointer-events-none absolute bottom-3 left-0 size-4 text-ink-3" aria-hidden />
            <input
              id="sup-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, code, contact or email"
              className="mt-1 h-10 w-full border-0 border-b border-line-strong bg-transparent pl-7 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink focus-visible:outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
            {missingEmail ? <span className="text-[12.5px] text-warning">{missingEmail} without a contact email</span> : null}
            <Checkbox checked={showInactive} onChange={setShowInactive} label="Show inactive" />
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={4} className="px-5" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No suppliers match" : "No suppliers registered yet"}
            description={data?.length ? "Try another search." : "Register a supplier to pick it when opening a case and to address supplier letters automatically."}
            action={
              !data?.length && canManage ? (
                <Button variant="accent" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
                  Register your first supplier
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li
                key={s.id}
                id={`supplier-${s.id}`}
                className={cn("grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center", focusId === s.id && "bg-brand-tint/50", !s.is_active && "opacity-60")}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink">{s.name}</span>
                    {s.supplier_code ? <span className="font-mono text-[11.5px] text-ink-3">{s.supplier_code}</span> : null}
                    {!s.is_active ? <Badge tone="neutral">Inactive</Badge> : s.open_cases ? <Badge tone="warning">{s.open_cases} open</Badge> : s.total_cases ? <Badge tone="success">Settled</Badge> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-3">
                    {s.contact_email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3.5" aria-hidden />
                        {s.contact_name ? `${s.contact_name} · ` : ""}
                        {s.contact_email}
                      </span>
                    ) : (
                      <span className="text-warning">No contact email</span>
                    )}
                    <span>{s.default_currency}{s.payment_terms ? ` · ${s.payment_terms}` : ""}</span>
                  </p>
                </div>
                <dl className="grid grid-cols-4 gap-3 text-[12px]">
                  {[
                    ["Open POs", s.open_purchase_orders],
                    ["Cases", s.total_cases],
                    ["Findings", s.active_findings],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="figure mt-0.5 text-[14px] text-ink">{v as number}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-ink-3">In dispute</dt>
                    <dd className="figure mt-0.5 truncate text-[14px] text-ink">{s.exposure.length ? s.exposure.map((m) => formatMoneyValue(m, { compact: true })).join(" + ") : "—"}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <ButtonLink href={`/app/investigations/new?supplier=${s.id}`} size="sm" variant="secondary" icon={<FilePlus2 className="size-3.5" aria-hidden />}>
                    New case
                  </ButtonLink>
                  <ButtonLink href={`/app/purchase-orders?supplier=${s.id}`} size="sm" variant="ghost">
                    Purchase orders
                  </ButtonLink>
                  {s.total_cases ? (
                    <Link href={`/app/investigations?search=${encodeURIComponent(s.name)}`} className="text-[12.5px] font-medium text-brand-ink hover:underline">
                      Cases →
                    </Link>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={() => setEditing(s)} className="pressable rounded-[8px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink" aria-label={`Edit ${s.name}`} title="Edit">
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {s.last_activity_at ? <p className="text-[11.5px] text-ink-3 lg:col-span-3">Last case activity {relativeTime(s.last_activity_at)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SupplierFormDialog
        workspaceId={workspace.id}
        open={adding || Boolean(editing)}
        supplier={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
          if (params.get("new")) router.replace("/app/suppliers");
        }}
      />
    </div>
  );
}
