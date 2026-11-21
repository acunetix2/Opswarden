"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronUp, Eye, FilePen, Lock, Send, X, Zap } from "lucide-react";
import { useState } from "react";

import { ApprovalStatusBadge, SeverityBadge } from "@/components/status/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { downloadText } from "@/lib/download";
import { formatDateTime, initials } from "@/lib/format";
import { parseIso } from "@/lib/period";
import type { Approval, ExportedDraft, Severity } from "@/lib/types";
import { useDecideApprovalMutation, useExecuteApprovalMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

/** What the findings on this approval's case add up to (computed by the Approvals page). */
export interface ApprovalContext {
  amount: string | null;
  topSeverity: Severity | null;
  bySeverity: Partial<Record<Severity, number>>;
  findingCount: number;
}

interface ApprovalCardProps {
  approval: Approval;
  context?: ApprovalContext;
  canDecide: boolean;
  canExecute: boolean;
  emailConfigured: boolean;
}

type Dialog = null | "approve" | "reject" | "execute";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function waitingFor(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - parseIso(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function Priority({ severity }: { severity: Severity | null }) {
  if (severity === "critical" || severity === "high") {
    return <Badge tone="danger" icon={<Zap />}>High priority</Badge>;
  }
  if (severity === "medium") return <Badge tone="warning">Medium priority</Badge>;
  return <Badge tone="neutral">Low priority</Badge>;
}

interface Step {
  label: string;
  who: string;
  at?: string | null;
  state: "done" | "current" | "todo" | "stopped";
}

function Chain({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-3 rounded-[10px] border border-line bg-canvas/70 px-4 py-3 sm:flex-row sm:items-center sm:gap-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
              s.state === "done" && "bg-success text-canvas",
              s.state === "current" && "bg-brand text-on-brand ring-4 ring-brand-tint",
              s.state === "todo" && "bg-surface-sunken text-ink-3",
              s.state === "stopped" && "bg-danger text-canvas",
            )}
          >
            {s.state === "done" ? <Check className="size-3.5" /> : s.state === "stopped" ? <X className="size-3.5" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-[13px] font-medium", s.state === "todo" ? "text-ink-3" : "text-ink")}>
              {s.label}
              <span className="sr-only"> ({s.state === "current" ? "current step" : s.state})</span>
            </span>
            <span className="block truncate text-[12px] text-ink-3">
              {s.who}
              {s.at ? ` · ${formatDateTime(s.at)}` : ""}
            </span>
          </span>
          {i < steps.length - 1 ? (
            <span aria-hidden className="mx-3 hidden flex-1 items-center sm:flex">
              <span className={cn("h-px flex-1", s.state === "done" ? "bg-success/60" : "bg-line-strong")} />
              <ArrowRight className={cn("size-3.5", s.state === "done" ? "text-success" : "text-ink-3")} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** One approval request: who, what, how much, where it is in the chain, and the decision buttons. */
export function ApprovalCard({ approval: a, context, canDecide, canExecute, emailConfigured }: ApprovalCardProps) {
  const toast = useToast();
  const [decide] = useDecideApprovalMutation();
  const [execute] = useExecuteApprovalMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comment, setComment] = useState("");
  const [exported, setExported] = useState<ExportedDraft | null>(null);
  const [expanded, setExpanded] = useState(false);

  const text = `To: ${a.recipient ?? "(not set)"}\nSubject: ${a.subject ?? ""}\n\n${a.body ?? ""}`;
  const pending = a.status === "pending";
  const rationale = a.rationale?.replace(/\[[A-Z]+\]\s*/g, "").trim();

  async function onDecide(decision: "approve" | "reject") {
    try {
      await decide({ approvalId: a.id, decision, comment: comment.trim() || undefined }).unwrap();
      toast("success", decision === "approve" ? "Letter approved" : "Letter rejected", decision === "approve" ? "It's ready to send under Signed." : undefined);
      setDialog(null);
      setComment("");
    } catch (err) {
      toast("danger", "Couldn't record the decision", toAppError(err).message);
    }
  }

  async function onExecute() {
    try {
      const res = await execute({ approvalId: a.id, caseId: a.case_id }).unwrap();
      if (res.export) {
        setExported(res.export);
        toast("info", "Letter ready to export", "Email sending isn't connected, so nothing was sent.");
      } else {
        toast("success", "Email sent", res.provider_reference ? `Provider reference ${res.provider_reference}` : undefined);
      }
      setDialog(null);
    } catch (err) {
      toast("danger", "The action didn't run", toAppError(err).message);
    }
  }

  const rejected = a.status === "rejected";
  const steps: Step[] = [
    { label: "Requested", who: a.requested_by_name ?? "A user", at: a.created_at, state: "done" },
    {
      label: rejected ? "Rejected" : "Sign-off",
      who: a.reviewed_by_name ?? (pending ? (canDecide ? "You" : "Waiting for a reviewer") : "Reviewer"),
      at: a.reviewed_at,
      state: rejected ? "stopped" : a.reviewed_at ? "done" : pending ? "current" : "todo",
    },
    {
      label: emailConfigured ? "Send" : "Send or export",
      who: a.executed_at ? "Done" : a.status === "approved" ? (canExecute ? "You" : "Waiting") : "After sign-off",
      at: a.executed_at,
      state: a.executed_at ? "done" : a.status === "approved" ? "current" : "todo",
    },
  ];

  return (
    <article aria-labelledby={`appr-${a.id}`} className={cn("rounded-[12px] border bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)]", pending ? "border-line-strong" : "border-line")}>
      {/* Summary row */}
      <div className="flex flex-col gap-4 px-5 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-canvas text-[12.5px] font-semibold text-ink-2">
            {initials(a.supplier_name ?? a.case_title ?? "?")}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`appr-${a.id}`} className="text-[16px] font-semibold leading-snug text-ink">
                {a.subject ?? "Supplier clarification letter"}
              </h3>
              {pending ? <Priority severity={context?.topSeverity ?? null} /> : <ApprovalStatusBadge status={a.status} />}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              {a.supplier_name ?? "Supplier"} · requested by {a.requested_by_name ?? "a user"} · {formatDateTime(a.created_at)}
            </p>
            {rationale ? <p className="mt-1.5 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-ink-2">{rationale}</p> : null}
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[22px] font-semibold leading-none tracking-tight text-ink tabular">{context?.amount ?? "\u2014"}</p>
          <p className="mt-1.5 text-[12px] text-ink-3">{context?.amount ? "Value in dispute" : "No money impact"}</p>
          <Link href={`/app/investigations/${a.case_id}`} className="mt-0.5 block font-mono text-[12px] font-medium text-brand-ink hover:underline">
            {a.case_number}
          </Link>
          {pending ? <p className="mt-0.5 text-[12px] text-ink-3">Waiting {waitingFor(a.created_at)}</p> : null}
        </div>
      </div>

      {/* Approval chain */}
      <div className="px-5 pt-4">
        <Chain steps={steps} />
      </div>

      {/* Letter and evidence */}
      <div className="grid gap-3 px-5 pt-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-label="Letter to be sent" className="rounded-[10px] border border-line p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-medium text-ink">Exactly what will be sent</p>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3" title="Any edit after approval voids it">
              <Lock className="size-3" aria-hidden />
              Locked
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-[3.5rem_1fr] gap-y-1 text-[12.5px]">
            <dt className="text-ink-3">To</dt>
            <dd className={a.recipient ? "truncate font-mono text-ink" : "text-warning"}>{a.recipient ?? "Not set: add an address or export the letter"}</dd>
            <dt className="text-ink-3">Subject</dt>
            <dd className="truncate text-ink">{a.subject}</dd>
          </dl>
          <p className={cn("mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2", !expanded && "line-clamp-4")}>{a.body}</p>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-ink hover:underline"
          >
            {expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            {expanded ? "Show less" : "Show full letter"}
          </button>
        </section>

        <section aria-label="Findings behind this letter" className="flex flex-col rounded-[10px] border border-line p-3.5">
          <p className="text-[12.5px] font-medium text-ink">Findings behind this letter</p>
          {context && context.findingCount ? (
            <>
              <p className="mt-2 text-[24px] font-semibold leading-none text-ink tabular">{context.findingCount}</p>
              <p className="mt-1 text-[12px] text-ink-3">{context.findingCount === 1 ? "finding not dismissed" : "findings not dismissed"}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SEVERITY_ORDER.filter((s) => context.bySeverity[s]).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1">
                    <SeverityBadge severity={s} />
                    <span className="text-[12px] text-ink-3 tabular">×{context.bySeverity[s]}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">No open findings on this case.</p>
          )}
          <Link href={`/app/investigations/${a.case_id}`} className="mt-auto inline-flex items-center gap-1 pt-3 text-[12.5px] font-medium text-brand-ink hover:underline">
            Check the evidence <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </section>
      </div>

      {exported ? (
        <div className="px-5 pt-3">
          <Notice
            tone="info"
            title="Approved letter exported, not sent"
            action={
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast("info", "Copied to clipboard"))}>
                  Copy
                </Button>
                <Button size="sm" variant="secondary" onClick={() => downloadText(`${a.case_number ?? "approval"}-approved-letter.txt`, text)}>
                  Download
                </Button>
              </div>
            }
          >
            {exported.note}
          </Notice>
        </div>
      ) : null}

      {a.comment ? <p className="px-5 pt-3 text-[12.5px] text-ink-2">Reviewer comment: &ldquo;{a.comment}&rdquo;</p> : null}

      {/* Actions */}
      <footer className="mt-4 flex flex-wrap items-center gap-2 rounded-b-[12px] border-t border-line bg-canvas/60 px-5 py-3">
        {pending && canDecide ? (
          <>
            <Button variant="success" onClick={() => setDialog("approve")} icon={<Check className="size-4" aria-hidden />}>
              Approve
            </Button>
            <Button variant="danger" onClick={() => setDialog("reject")} icon={<X className="size-4" aria-hidden />}>
              Reject
            </Button>
          </>
        ) : null}
        {a.status === "approved" && canExecute ? (
          <Button variant="accent" onClick={() => setDialog("execute")} icon={<Send className="size-4" aria-hidden />}>
            {emailConfigured ? "Send letter" : "Export letter"}
          </Button>
        ) : null}
        <ButtonLink href={`/app/investigations/${a.case_id}`} variant="secondary" icon={<Eye className="size-4" aria-hidden />}>
          Review case
        </ButtonLink>
        {pending ? (
          <ButtonLink href={`/app/investigations/${a.case_id}/email`} variant="ghost" icon={<FilePen className="size-4" aria-hidden />}>
            Request changes
          </ButtonLink>
        ) : null}

        <p className="ml-auto text-[12px] text-ink-3">
          {pending && !canDecide ? "Waiting for an authorized approver." : null}
          {a.status === "executed" ? `Sent ${formatDateTime(a.executed_at)}${a.provider_reference ? ` · ref ${a.provider_reference}` : ""}` : null}
          {a.status === "expired" ? "Voided: the letter or case changed after approval." : null}
          {a.status === "rejected" ? "A new draft can be prepared from the case." : null}
          {a.status === "failed" ? "Sending failed. Try again or export the letter." : null}
        </p>
      </footer>

      <ConfirmDialog
        open={dialog === "approve" || dialog === "reject"}
        title={dialog === "approve" ? "Approve this letter?" : "Reject this letter?"}
        description={
          dialog === "approve"
            ? "You confirm you've read the letter and the evidence behind it. Approving doesn't send anything yet."
            : "The letter won't be sent. A new draft can be prepared from the case."
        }
        confirmLabel={dialog === "approve" ? "Approve" : "Reject"}
        confirmVariant={dialog === "approve" ? "success" : "danger"}
        onClose={() => setDialog(null)}
        onConfirm={() => onDecide(dialog === "approve" ? "approve" : "reject")}
      >
        <Field label="Comment" htmlFor={`c-${a.id}`} hint="Optional. Saved in the audit trail.">
          <Textarea id={`c-${a.id}`} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "execute"}
        title={emailConfigured ? "Send this letter?" : "Export the approved letter?"}
        description={
          emailConfigured
            ? `This sends the approved letter to ${a.recipient ?? "the recipient"}. It runs once; retrying won't send a duplicate.`
            : "Email sending isn't connected. OpsWarden records the export and gives you the approved text to send yourself."
        }
        confirmLabel={emailConfigured ? "Send letter" : "Export letter"}
        onClose={() => setDialog(null)}
        onConfirm={onExecute}
      />
    </article>
  );
}
