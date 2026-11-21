"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useAllFindingsQuery, useApprovalsQuery, useCasesQuery, useMembersQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

interface Step {
  key: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
}

/**
 * First-run checklist. Each step is ticked from real workspace data, so it
 * never claims progress that didn't happen. Hidden once complete or dismissed.
 */
export function GettingStarted() {
  const { workspace, can } = useWorkspace();
  const [dismissed, setDismissed, loaded] = useLocalStorage(`ow-getting-started-hidden:${workspace.id}`, false);
  const { data: members } = useMembersQuery(workspace.id);
  const { data: cases } = useCasesQuery({ workspaceId: workspace.id, include_archived: true });
  const { data: findings } = useAllFindingsQuery(workspace.id);
  const { data: approvals } = useApprovalsQuery({ workspaceId: workspace.id });

  if (!loaded || dismissed || !members || !cases || !findings || !approvals) return null;

  const steps: Step[] = [
    ...(can("manage_workspace")
      ? [
          {
            key: "team",
            title: "Invite a teammate",
            body: "Add a reviewer so someone other than you can sign off supplier emails.",
            href: "/app/team",
            cta: "Team & access",
            done: members.length > 1,
          },
        ]
      : []),
    {
      key: "case",
      title: "Open your first case",
      body: "Name the supplier and the purchase order you want to check.",
      href: "/app/investigations/new",
      cta: "New investigation",
      done: cases.length > 0,
    },
    {
      key: "analyze",
      title: "Upload documents and run the analysis",
      body: "Add the purchase order, invoice and delivery receipt, then press Run analysis.",
      href: cases[0] ? `/app/investigations/${cases[0].id}` : "/app/investigations/new",
      cta: cases[0] ? "Open latest case" : "New investigation",
      done: cases.some((c) => c.status !== "draft"),
    },
    {
      key: "review",
      title: "Review a finding",
      body: "Confirm a real mismatch, or dismiss a false alarm with a reason.",
      href: "/app/findings",
      cta: "All findings",
      done: findings.some((f) => f.status === "confirmed" || f.status === "dismissed"),
    },
    {
      key: "approve",
      title: "Approve a supplier email",
      body: "Draft the letter from a case, then sign it off under Approvals.",
      href: "/app/approvals",
      cta: "Approvals",
      done: approvals.some((a) => a.status === "approved" || a.status === "executed"),
    },
  ];

  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card>
      <CardHeader
        title="Getting started"
        description={`${complete} of ${steps.length} done. Each step ticks itself when it happens.`}
        action={
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="pressable inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12.5px] text-ink-3 hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
            Hide
          </button>
        }
      />
      <div aria-hidden className="mx-5 mt-3 mb-1 h-1 bg-surface-sunken">
        <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${(complete / steps.length) * 100}%` }} />
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.key} className={cn("flex items-start gap-3 px-5 py-3.5", isNext && "bg-brand-tint")}>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                  s.done ? "bg-success text-canvas" : isNext ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-3",
                )}
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[14px]", s.done ? "text-ink-3 line-through decoration-ink-3/50" : "font-medium text-ink")}>
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : ""}</span>
                </p>
                {!s.done ? <p className="mt-0.5 text-[13px] text-ink-2">{s.body}</p> : null}
              </div>
              {!s.done ? (
                <Link
                  href={s.href}
                  className={cn(
                    "pressable shrink-0 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium",
                    isNext ? "bg-ink text-canvas hover:bg-ink-2" : "border border-line-strong text-ink hover:border-ink",
                  )}
                >
                  {s.cta}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
