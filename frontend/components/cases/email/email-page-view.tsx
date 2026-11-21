"use client";

import Link from "next/link";

import { CaseStatusBadge, SEVERITY_RULE } from "@/components/status/status-badges";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { sortFindings } from "@/lib/findings";
import { formatMoney } from "@/lib/format";
import { useApprovalsQuery, useFindingsQuery, useGetCaseQuery, useSettingsQuery, useSummaryQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { EmailComposer } from "../detail/email-composer";

/** Full-page supplier letter (DESIGN 6.8), set beside the findings it is built from. */
export function EmailPageView({ caseId }: { caseId: string }) {
  const { workspace, can } = useWorkspace();
  const caseQ = useGetCaseQuery(caseId);
  const summaryQ = useSummaryQuery(caseId);
  const findingsQ = useFindingsQuery(caseId);
  const { data: approvals } = useApprovalsQuery({ workspaceId: workspace.id });
  const { data: settings } = useSettingsQuery(workspace.id);

  if (caseQ.error) return <ErrorState error={caseQ.error} onRetry={caseQ.refetch} />;
  const kase = caseQ.data;
  if (!kase) return <Skeleton className="h-96 w-full" />;

  const included = sortFindings(findingsQ.data?.items ?? []).filter((f) => f.status !== "dismissed" && f.finding_type !== "missing_document");

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <nav aria-label="Breadcrumb" className="label flex flex-wrap gap-x-2">
          <Link href="/app/investigations" className="hover:text-ink">Investigations</Link>
          <span aria-hidden>/</span>
          <Link href={`/app/investigations/${kase.id}`} className="hover:text-ink">{kase.case_number}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-ink">Letter</span>
        </nav>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="figure text-[13px] text-ink-2">{kase.case_number}</span>
            <CaseStatusBadge status={kase.status} />
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[26px]">Letter to {kase.supplier_name ?? "the supplier"}</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-2">
            Edit the draft, then request approval. Nothing is sent until an authorized reviewer approves it.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <EmailComposer
          kase={kase}
          analyzed={Boolean(summaryQ.data?.analyzed)}
          approvals={(approvals ?? []).filter((a) => a.case_id === kase.id)}
          emailConfigured={settings?.email_configured ?? false}
          canDraft={can("generate_recommendation")}
          canRequest={can("request_approval")}
        />
        <aside aria-label="Evidence summary">
          <Card>
            <CardHeader title="Grounded in" description="Open findings only. Dismissed findings and missing-document notes are left out." />
            {!findingsQ.data ? (
              <Skeleton className="m-5 h-24" />
            ) : included.length === 0 ? (
              <EmptyState title="No open discrepancies" description="The draft becomes a general clarification request." />
            ) : (
              <ol className="divide-y divide-line">
                {included.map((f, i) => (
                  <li key={f.id} className="relative py-3.5 pr-5 pl-6">
                    <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_RULE[f.severity]}`} />
                    <p className="label">Exhibit {String(i + 1).padStart(2, "0")} · {f.severity}</p>
                    <p className="mt-1 text-[13.5px] font-medium text-ink">{f.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{f.description}</p>
                    {f.impact_amount && f.currency ? (
                      <p className="figure mt-1.5 text-[13px] text-ink">{formatMoney(f.impact_amount, f.currency)}</p>
                    ) : null}
                    <Link href={`/app/investigations/${kase.id}#finding-${f.id}`} className="mt-1.5 inline-block text-[12px] font-medium text-brand-ink hover:underline">
                      {f.evidence.length} evidence reference{f.evidence.length === 1 ? "" : "s"} →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
