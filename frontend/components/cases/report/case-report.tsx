"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { latestByType } from "@/lib/documents";
import { comparedLabel, IMPACT_FORMULA, sortFindings } from "@/lib/findings";
import {
  CASE_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  eventDetail,
  eventLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyValue,
  formatQuantity,
  humanizeFieldPath,
} from "@/lib/format";
import type { ComparedValue, DocumentMeta, Finding, Severity } from "@/lib/types";
import {
  useApprovalsQuery,
  useCaseActivityQuery,
  useCaseDocumentsQuery,
  useComparisonQuery,
  useFindingsQuery,
  useGetCaseQuery,
  useSummaryQuery,
} from "@/store/api";
import { useWorkspace } from "@/store/hooks";

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
const STATUS_LABEL: Record<string, string> = { open: "Open", confirmed: "Confirmed", dismissed: "Dismissed", needs_review: "Needs review" };
const APPROVAL_LABEL: Record<string, string> = {
  pending: "Awaiting approval",
  approved: "Approved, not sent",
  rejected: "Rejected",
  executed: "Sent",
  failed: "Failed",
  expired: "Voided",
};
const DOC_CODE: Record<string, string> = { purchase_order: "PO", invoice: "INV", delivery_receipt: "DR" };
const AUDIT_LIMIT = 30;

function valueText(v: ComparedValue | null): string {
  if (!v) return "\u2014";
  if (v.value !== undefined) return /^-?\d+(\.\d+)?$/.test(v.value) ? formatQuantity(v.value) : v.value;
  return v.values ? Object.values(v.values).join(" / ") : "\u2014";
}

/** Section heading with a number, kept with the content that follows it when printing. */
function Section({ n, title, children, note }: { n: number; title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mt-9 break-inside-auto">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-ink/80 pb-1.5 break-after-avoid">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink">
          <span className="mr-2 text-ink-3 tabular">{n}.</span>
          {title}
        </h2>
        {note ? <span className="text-[11px] text-ink-3">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

const th = "border-b border-line-strong px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3";
const td = "border-b border-line px-2 py-2 align-top text-[12px] text-ink";

/**
 * Formal, printable investigation report. Rendered as an A4 sheet on screen
 * and as a clean multi-page document when printed or saved as PDF.
 */
export function CaseReport({ caseId }: { caseId: string }) {
  const params = useSearchParams();
  const { workspace, user } = useWorkspace();
  const caseQ = useGetCaseQuery(caseId);
  const summaryQ = useSummaryQuery(caseId);
  const findingsQ = useFindingsQuery(caseId);
  const comparisonQ = useComparisonQuery(caseId);
  const docsQ = useCaseDocumentsQuery(caseId);
  const activityQ = useCaseActivityQuery(caseId);
  const { data: approvals } = useApprovalsQuery({ workspaceId: workspace.id });

  const kase = caseQ.data;
  const summary = summaryQ.data;
  const findings = useMemo(() => sortFindings(findingsQ.data?.items ?? []), [findingsQ.data]);
  const documents = docsQ.data;
  const latest = useMemo(() => latestByType(documents), [documents]);
  const docById = useMemo(() => new Map((documents ?? []).map((d) => [d.id, d])), [documents]);
  const caseApprovals = (approvals ?? []).filter((a) => a.case_id === caseId);
  const generatedAt = useMemo(() => new Date(), []);

  const ready = Boolean(kase && summary && findingsQ.data && comparisonQ.data && documents && activityQ.data);

  // "Print report" on the case page opens this with ?print=1: open the dialog once everything has loaded.
  const printed = useRef(false);
  useEffect(() => {
    if (ready && params.get("print") === "1" && !printed.current) {
      printed.current = true;
      const t = window.setTimeout(() => window.print(), 350);
      return () => window.clearTimeout(t);
    }
  }, [ready, params]);

  if (caseQ.error) return <ErrorState error={caseQ.error} onRetry={caseQ.refetch} />;

  const active = findings.filter((f) => f.status !== "dismissed");
  const confirmed = findings.filter((f) => f.status === "confirmed").length;
  const dismissed = findings.length - active.length;
  const undecided = findings.filter((f) => f.status === "open" || f.status === "needs_review").length;
  const [intro, ...rest] = (summary?.summary ?? "").split("\n");
  const bullets = rest.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).replace(/^\[[A-Z]+\]\s*/, ""));

  return (
    <div className="report-root">
      {/* Screen-only toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/app/investigations/${caseId}`} className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-ink-2 hover:bg-surface-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to case
        </Link>
        <p className="ml-auto text-[12.5px] text-ink-3">A4 report. Use &ldquo;Save as PDF&rdquo; in the print dialog to keep a file.</p>
        <Button variant="accent" onClick={() => window.print()} disabled={!ready} icon={<Printer className="size-4" aria-hidden />}>
          Print or save as PDF
        </Button>
      </div>

      <article
        aria-label="Investigation report"
        className="report-sheet mx-auto w-full max-w-[210mm] rounded-[6px] border border-line bg-white px-[16mm] py-[14mm] text-ink shadow-[0_10px_40px_rgb(17_17_17/0.10)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        {!ready || !kase || !summary ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Letterhead */}
            <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
              <div className="flex items-center gap-3">
                <LogoMark className="size-12" />
                <div>
                  <p className="flex items-baseline text-[20px] leading-none">
                    <span className="font-semibold tracking-tight">Ops</span>
                    <span className="display italic">Warden</span>
                  </p>
                  <p className="mt-1 text-[11px] text-ink-3">{workspace.name}</p>
                </div>
              </div>
              <div className="text-right text-[11px] leading-relaxed text-ink-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Procurement investigation report</p>
                <p>
                  Case <span className="font-mono">{kase.case_number}</span>
                </p>
                <p>Generated {formatDateTime(generatedAt.toISOString())}</p>
                <p>Confidential · internal use</p>
              </div>
            </header>

            {/* Title */}
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Status: {CASE_STATUS_LABEL[kase.status] ?? kase.status}</p>
              <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em]">{kase.title}</h1>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2.5 rounded-[4px] border border-line px-4 py-3 text-[12px]">
              {(
                [
                  ["Supplier", kase.supplier_name ?? "\u2014"],
                  ["PO reference", kase.supplier_reference ?? "\u2014"],
                  ["Case owner", kase.owner_name ?? "\u2014"],
                  ["Opened", formatDate(kase.created_at)],
                  ["Resolved", kase.resolved_at ? formatDate(kase.resolved_at) : "Not yet"],
                  ["Currency", kase.currency],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            {/* 1. Summary */}
            <Section n={1} title="Executive summary">
              <div className="grid grid-cols-4 gap-3">
                {(
                  [
                    ["Findings", String(findings.length)],
                    ["Confirmed", String(confirmed)],
                    ["Awaiting decision", String(undecided)],
                    ["Value in dispute", summary.exposure.length ? summary.exposure.map((m) => formatMoneyValue(m)).join(" + ") : "\u2014"],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="rounded-[4px] border border-line px-3 py-2">
                    <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{k}</p>
                    <p className="mt-0.5 text-[17px] font-semibold tabular">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed">{intro}</p>
              {bullets.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-2">
                  {bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 rounded-[4px] border-l-[3px] border-brand bg-brand-tint/50 px-3 py-2 text-[12.5px] break-inside-avoid">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-brand-ink">Recommended next step</p>
                <p className="mt-0.5">{summary.recommended_next_step}</p>
              </div>
            </Section>

            {/* 2. Findings */}
            <Section n={2} title="Findings" note={`${active.length} active · ${dismissed} dismissed`}>
              {findings.length === 0 ? (
                <p className="text-[12.5px] text-ink-2">No discrepancies were found. The records reconcile within the configured tolerances.</p>
              ) : (
                <>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={`${th} w-7`}>#</th>
                        <th className={th}>Finding</th>
                        <th className={th}>Severity</th>
                        <th className={th}>Status</th>
                        <th className={th}>Expected → observed</th>
                        <th className={`${th} text-right`}>Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f, i) => (
                        <tr key={f.id} className={f.status === "dismissed" ? "text-ink-3" : undefined}>
                          <td className={`${td} tabular text-ink-3`}>{i + 1}</td>
                          <td className={td}>
                            <p className="font-semibold">{f.title}</p>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{f.description}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-ink-3">{f.rule_id}</p>
                          </td>
                          <td className={td}>{SEVERITY_LABEL[f.severity] ?? f.severity}</td>
                          <td className={td}>{STATUS_LABEL[f.status] ?? f.status}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            {f.expected_value || f.observed_value ? (
                              <>
                                <span className="text-ink-3">{comparedLabel(f.expected_value?.field ?? f.observed_value?.field)}: </span>
                                {valueText(f.expected_value)} → <strong>{valueText(f.observed_value)}</strong>
                              </>
                            ) : (
                              "\u2014"
                            )}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right tabular`}>
                            {f.impact_amount && f.currency ? formatMoney(f.impact_amount, f.currency) : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3 className="mt-5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-2 break-after-avoid">Evidence by finding</h3>
                  <ol className="mt-2 space-y-3">
                    {findings.map((f, i) => (
                      <EvidenceBlock key={f.id} n={i + 1} finding={f} docById={docById} />
                    ))}
                  </ol>
                </>
              )}
            </Section>

            {/* 3. Three-way match */}
            <Section n={3} title="Three-way match" note="Ordered (PO) · Received (DR) · Invoiced (INV)">
              {comparisonQ.data!.lines.length === 0 ? (
                <p className="text-[12.5px] text-ink-2">No line items were available to compare.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Item</th>
                      <th className={`${th} text-right`}>Ordered</th>
                      <th className={`${th} text-right`}>Received</th>
                      <th className={`${th} text-right`}>Invoiced</th>
                      <th className={`${th} text-right`}>PO price</th>
                      <th className={`${th} text-right`}>Invoice price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonQ.data!.lines.map((l) => {
                      const cur = comparisonQ.data!.currency;
                      const qtyOff = l.received !== null && l.invoiced !== null && Number(l.received) !== Number(l.invoiced);
                      const priceOff = l.po_unit_price !== null && l.invoice_unit_price !== null && Number(l.po_unit_price) !== Number(l.invoice_unit_price);
                      return (
                        <tr key={l.key}>
                          <td className={td}>
                            <p className="font-medium">{l.description ?? l.sku ?? "Item"}</p>
                            {l.sku ? <p className="font-mono text-[10px] text-ink-3">{l.sku}{l.match_method !== "sku" ? ` · matched ${l.match_method}` : ""}</p> : null}
                          </td>
                          <td className={`${td} text-right tabular`}>{formatQuantity(l.ordered)}</td>
                          <td className={`${td} text-right tabular ${qtyOff ? "font-semibold text-brand-ink" : ""}`}>{formatQuantity(l.received)}</td>
                          <td className={`${td} text-right tabular ${qtyOff ? "font-semibold text-brand-ink" : ""}`}>{formatQuantity(l.invoiced)}</td>
                          <td className={`${td} text-right tabular`}>{l.po_unit_price ? formatMoney(l.po_unit_price, cur) : "\u2014"}</td>
                          <td className={`${td} text-right tabular ${priceOff ? "font-semibold text-brand-ink" : ""}`}>
                            {l.invoice_unit_price ? formatMoney(l.invoice_unit_price, cur) : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* 4. Documents */}
            <Section n={4} title="Source documents">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Type</th>
                    <th className={th}>File</th>
                    <th className={th}>Extraction</th>
                    <th className={th}>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {documents!.length === 0 ? (
                    <tr>
                      <td className={td} colSpan={4}>No documents on file.</td>
                    </tr>
                  ) : (
                    documents!.map((d) => {
                      const current = Object.values(latest).some((x) => x?.id === d.id);
                      return (
                        <tr key={d.id} className={current ? undefined : "text-ink-3"}>
                          <td className={td}>{DOCUMENT_TYPE_LABEL[d.document_type]}</td>
                          <td className={`${td} font-mono text-[11px]`}>{d.original_filename}</td>
                          <td className={td}>{current ? (d.processing_status === "extracted" ? "Extracted" : d.processing_status === "failed" ? "Failed" : "Pending") : "Superseded"}</td>
                          <td className={td}>{formatDateTime(d.created_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </Section>

            {/* 5. Supplier communication */}
            <Section n={5} title="Supplier communication and approvals">
              {caseApprovals.length === 0 ? (
                <p className="text-[12.5px] text-ink-2">No supplier letter has been drafted for approval.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Letter</th>
                      <th className={th}>Status</th>
                      <th className={th}>Requested</th>
                      <th className={th}>Decision</th>
                      <th className={th}>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseApprovals.map((a) => (
                      <tr key={a.id}>
                        <td className={td}>
                          <p className="font-medium">{a.subject ?? "Supplier letter"}</p>
                          <p className="text-[11px] text-ink-3">To {a.recipient ?? "not set"}</p>
                        </td>
                        <td className={td}>{APPROVAL_LABEL[a.status] ?? a.status}</td>
                        <td className={td}>
                          {a.requested_by_name ?? "\u2014"}
                          <p className="text-[11px] text-ink-3">{formatDateTime(a.created_at)}</p>
                        </td>
                        <td className={td}>
                          {a.reviewed_at ? (
                            <>
                              {a.reviewed_by_name ?? "Reviewer"}
                              <p className="text-[11px] text-ink-3">{formatDateTime(a.reviewed_at)}</p>
                              {a.comment ? <p className="text-[11px] italic text-ink-2">&ldquo;{a.comment}&rdquo;</p> : null}
                            </>
                          ) : (
                            "\u2014"
                          )}
                        </td>
                        <td className={td}>{a.executed_at ? formatDateTime(a.executed_at) : "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* 6. Audit trail */}
            <Section n={6} title="Audit trail" note={activityQ.data!.length > AUDIT_LIMIT ? `Latest ${AUDIT_LIMIT} of ${activityQ.data!.length} entries` : `${activityQ.data!.length} entries`}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} w-40`}>When</th>
                    <th className={th}>Who</th>
                    <th className={th}>What</th>
                  </tr>
                </thead>
                <tbody>
                  {activityQ.data!.slice(0, AUDIT_LIMIT).map((e) => {
                    const detail = eventDetail(e);
                    return (
                      <tr key={e.id}>
                        <td className={`${td} whitespace-nowrap text-[11px] text-ink-2`}>{formatDateTime(e.created_at)}</td>
                        <td className={`${td} text-[11.5px]`}>{e.actor_type === "user" ? (e.actor_name ?? "User") : e.actor_type === "agent" ? "OpsWarden agent" : "System"}</td>
                        <td className={`${td} text-[11.5px]`}>
                          {eventLabel(e.event_type)}
                          {detail ? <span className="text-ink-3"> · {detail}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            {/* Sign-off */}
            <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid">
              {[
                ["Prepared by", user.full_name || user.email],
                ["Reviewed and approved by", ""],
              ].map(([label, name]) => (
                <div key={label}>
                  <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{label}</p>
                  <p className="mt-6 h-6 border-b border-ink text-[12.5px]">{name}</p>
                  <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
                    <span>Name and signature</span>
                    <span>Date: ______________</span>
                  </div>
                </div>
              ))}
            </section>

            <footer className="mt-10 flex justify-between border-t border-line pt-2 text-[10px] text-ink-3">
              <span>
                OpsWarden · {kase.case_number} · generated {formatDateTime(generatedAt.toISOString())}
              </span>
              <span>Findings are derived from rule-based comparison of the uploaded records. Nothing in this report changes payments or ledgers.</span>
            </footer>
          </>
        )}
      </article>
    </div>
  );
}

function EvidenceBlock({ n, finding, docById }: { n: number; finding: Finding; docById: Map<string, DocumentMeta> }) {
  const formula = IMPACT_FORMULA[finding.rule_id];
  return (
    <li className="rounded-[4px] border border-line px-3 py-2 break-inside-avoid">
      <p className="text-[12px] font-semibold">
        <span className="mr-1.5 text-ink-3 tabular">{n}.</span>
        {finding.title}
      </p>
      {finding.evidence.length ? (
        <ul className="mt-1 space-y-1">
          {finding.evidence.map((ev, i) => {
            const doc = ev.document_id ? docById.get(ev.document_id) : undefined;
            return (
              <li key={`${ev.document_id}-${ev.field_path}-${i}`} className="grid grid-cols-[2.25rem_1fr] text-[11.5px] leading-snug">
                <span className="font-mono text-[10.5px] font-semibold text-ink-2">{doc ? DOC_CODE[doc.document_type] : "DOC"}</span>
                <span>
                  <span className="font-medium">{humanizeFieldPath(ev.field_path)}</span>
                  {doc ? <span className="text-ink-3"> · {doc.original_filename}</span> : null}
                  {ev.page_number ? <span className="text-ink-3"> · page {ev.page_number}</span> : null}
                  {ev.snippet ? <span className="block font-mono text-[10.5px] text-ink-2">&ldquo;{ev.snippet.slice(0, 220)}&rdquo;</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-[11.5px] text-ink-3">No document evidence attached.</p>
      )}
      {formula && finding.impact_amount ? <p className="mt-1 text-[10.5px] text-ink-3">Impact = {formula}</p> : null}
    </li>
  );
}
