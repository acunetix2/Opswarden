"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { firstName, formatMoneyValue, greeting } from "@/lib/format";
import { useOverviewQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { ActionRequired } from "./action-required";
import { GettingStarted } from "./getting-started";
import { FlowGuide } from "./flow-guide";
import { MetricCell, MetricCellSkeleton, MetricStrip } from "./metric-card";
import { OverviewChart } from "./overview-chart";
import { RecentCases } from "./recent-cases";

type Period = "7" | "30" | "90";
const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function count(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function OverviewView() {
  const { workspace, user, can } = useWorkspace();
  const [period, setPeriod] = useState<Period>("30");
  const { data, error, isFetching, refetch } = useOverviewQuery({ workspaceId: workspace.id, days: Number(period) });
  const m = data?.metrics;
  const exposure = m?.exposure ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${workspace.name} command center`}
        title={
          <>
            {greeting()}, <em className="italic">{firstName(user.full_name) || "there"}</em>.
          </>
        }
        description={
          m ? (
            <span className="block space-y-1">
              <span className="block">
                {m.pending_approvals || m.needs_review ? (
                  <>
                    <strong className="text-brand-ink">{count(m.pending_approvals, "action")}</strong> waiting for approval,{" "}
                    <strong className="text-brand-ink">{count(m.needs_review, "case")}</strong> needing review.
                  </>
                ) : (
                  <>Nothing is waiting on you. Every open case is moving.</>
                )}
              </span>
              <span className="block text-ink-3">
                {m.open_cases} cases open · {m.resolved_in_period} resolved in the last {period} days ·{" "}
                {exposure.length ? (
                  <span className="text-brand-ink">{exposure.map((e) => formatMoneyValue(e)).join(" + ")} in dispute</span>
                ) : (
                  "no outstanding exposure"
                )}
              </span>
            </span>
          ) : (
            "Loading today's ledger…"
          )
        }
        actions={
          can("create_case") ? (
            <ButtonLink href="/app/investigations/new" variant="accent" icon={<Plus className="size-4" aria-hidden />}>
              New investigation
            </ButtonLink>
          ) : null
        }
      />

      {error && !data ? (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      ) : null}

      <GettingStarted />

      <section aria-label="Key figures">
        <MetricStrip>
          {!m ? (
            Array.from({ length: 4 }, (_, i) => <MetricCellSkeleton key={i} />)
          ) : (
            <>
              <MetricCell
                href="/app/investigations"
                label="Open cases"
                value={m.open_cases}
                detail={
                  <>
                    <strong className={m.open_cases_created_in_period ? "text-brand-ink" : undefined}>
                      {m.open_cases_created_in_period}
                    </strong>{" "}
                    opened in {period} days ·{" "}
                    <strong className={m.needs_review ? "text-brand-ink" : undefined}>{m.needs_review}</strong> need review
                  </>
                }
              />
              <MetricCell
                href="/app/approvals"
                label="Awaiting approval"
                value={m.pending_approvals}
                attention={m.pending_approvals > 0}
                detail={m.pending_approvals ? "Supplier emails drafted, held for a reviewer's signature" : "No external actions waiting"}
              />
              <MetricCell
                label="Open discrepancies"
                value={m.open_findings}
                detail={
                  <>
                    <strong className={m.findings_in_period ? "text-brand-ink" : undefined}>{m.findings_in_period}</strong>{" "}
                    new {m.findings_in_period === 1 ? "finding" : "findings"} in {period} days
                    {m.open_findings > m.findings_in_period ? ` · ${m.open_findings - m.findings_in_period} carried from earlier` : ""}
                  </>
                }
              />
              <MetricCell
                label="Value in dispute"
                value={exposure.length ? formatMoneyValue(exposure[0], { compact: true }) : "—"}
                attention={exposure.length > 0}
                detail={
                  exposure.length > 1 ? (
                    <>
                      Primary currency shown · also{" "}
                      {exposure
                        .slice(1)
                        .map((e) => formatMoneyValue(e))
                        .join(", ")}
                    </>
                  ) : exposure.length === 1 ? (
                    <>Open findings with a calculated monetary impact · precise totals on the case pages</>
                  ) : (
                    <>All discrepancies settled or non-monetary</>
                  )
                }
              />
            </>
          )}
        </MetricStrip>
        {m && (m.findings_in_period > 0 || m.resolved_in_period > 0) ? (
          <p className="mt-3 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[12.5px] leading-relaxed text-ink-2">
            Activity this period: {m.findings_in_period} {m.findings_in_period === 1 ? "finding" : "findings"} identified
            {m.resolved_in_period ? (
              <>
                {" · "}
                <strong className="text-success">{m.resolved_in_period}</strong> {m.resolved_in_period === 1 ? "case" : "cases"} closed
              </>
            ) : null}
            {m.open_cases_created_in_period ? ` · ${m.open_cases_created_in_period} new ${m.open_cases_created_in_period === 1 ? "case" : "cases"} opened` : null}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            index="01"
            title="Daily tally"
            description={
              m ? (
                <>
                  <strong className="text-success">{m.resolved_in_period}</strong> resolved in the last {period} days ·{" "}
                  <strong>{m.open_cases_created_in_period}</strong> opened
                </>
              ) : (
                "Cases opened and resolved"
              )
            }
            action={<Segmented label="Time period" options={PERIODS} value={period} onChange={setPeriod} />}
          />
          <CardBody className="pt-5" aria-busy={isFetching}>
            {data ? <OverviewChart series={data.series} /> : <Skeleton className="h-[262px] w-full" />}
          </CardBody>
        </Card>
        {data ? <ActionRequired items={data.attention} /> : <Skeleton className="min-h-80" />}
      </div>

      {data ? <RecentCases cases={data.recent_cases} /> : <Skeleton className="h-72" />}

      <FlowGuide />
    </div>
  );
}
