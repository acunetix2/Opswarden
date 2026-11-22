"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toAppError } from "@/lib/api-error";
import { OUTCOMES, amountProblem, defaultRecoveredAmount, outcomeRecovers } from "@/lib/recovery";
import type { Case, Money, ResolutionOutcome } from "@/lib/types";
import {
  useArchiveCaseMutation,
  useReopenCaseMutation,
  useResolveCaseMutation,
  useUpdateCaseMutation,
} from "@/store/api";
import { useToast, useWorkspace } from "@/store/hooks";

const RESOLVABLE = new Set(["needs_review", "ready_for_approval", "in_progress"]);
const ARCHIVABLE = new Set(["draft", "needs_review", "ready_for_approval", "failed", "resolved"]);

type Dialog = null | "resolve" | "notes" | "archive" | "reopen";

interface CaseActionsProps {
  kase: Case;
  hasDocuments: boolean;
  analyzed: boolean;
  /** Value in dispute on this case, used to prefill the recovered amount. */
  exposure?: Money[];
}

/** Header actions. Every one is re-checked against role and status on the server. */
export function CaseActions({ kase, hasDocuments, analyzed, exposure }: CaseActionsProps) {
  const toast = useToast();
  const { can } = useWorkspace();
  const [resolve] = useResolveCaseMutation();
  const [archive] = useArchiveCaseMutation();
  const [reopen] = useReopenCaseMutation();
  const [update] = useUpdateCaseMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(kase.notes ?? "");
  const [outcome, setOutcome] = useState<ResolutionOutcome>("no_discrepancy");
  const [amount, setAmount] = useState("");

  const closed = kase.status === "resolved" || kase.status === "archived";
  const busy = kase.status === "processing";
  const lifecycle = can("review_finding"); // admin + reviewer (MANAGE_CASE_LIFECYCLE on the server)

  const recovers = outcomeRecovers(outcome);
  const amountError = recovers ? amountProblem(amount) : null;

  function open(d: Dialog) {
    setText("");
    if (d === "resolve") {
      const prefill = defaultRecoveredAmount(exposure, kase.currency);
      setOutcome(prefill ? "recovered" : "no_discrepancy");
      setAmount(prefill);
    }
    setDialog(d);
  }

  async function act(fn: () => Promise<unknown>, success: string, failure: string) {
    try {
      await fn();
      toast("success", success);
      setDialog(null);
    } catch (err) {
      toast("danger", failure, toAppError(err).message);
    }
  }

  return (
    <>
      <ButtonLink
        href={`/app/investigations/${kase.id}/report`}
        variant="secondary"
        size="sm"
        icon={<Printer className="size-3.5" aria-hidden />}
        title="Open the formal investigation report, ready to print or save as PDF"
      >
        Report
      </ButtonLink>
      {can("upload_document") ? (
        <Button variant="ghost" size="sm" onClick={() => { setNotes(kase.notes ?? ""); setDialog("notes"); }}>
          {kase.notes ? "Edit note" : "Add note"}
        </Button>
      ) : null}
      {ARCHIVABLE.has(kase.status) && lifecycle ? (
        <Button variant="ghost" size="sm" onClick={() => open("archive")}>
          Archive
        </Button>
      ) : null}
      {closed && lifecycle ? (
        <Button variant="secondary" size="sm" onClick={() => open("reopen")}>
          Reopen case
        </Button>
      ) : null}
      {analyzed && !closed && can("generate_recommendation") ? (
        <ButtonLink href={`/app/investigations/${kase.id}/email`} variant="secondary" size="sm">
          Supplier letter
        </ButtonLink>
      ) : null}
      {RESOLVABLE.has(kase.status) && lifecycle ? (
        <Button variant="secondary" size="sm" onClick={() => open("resolve")}>
          Mark resolved
        </Button>
      ) : null}
      {/* Run / Re-run analysis lives in the Analysis engine panel under the case header. */}
      {busy ? (
        <Button size="sm" variant="secondary" loading disabled>
          Analyzing…
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "resolve"}
        title="Mark this case resolved?"
        description="Record how the discrepancy was settled. This closes the case; it doesn't change payments or accounting records."
        confirmLabel="Mark resolved"
        confirmDisabled={Boolean(amountError)}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          act(
            () =>
              resolve({
                caseId: kase.id,
                outcome,
                recovered_amount: recovers ? amount.trim() || undefined : undefined,
                comment: text.trim() || undefined,
              }).unwrap(),
            "Case resolved",
            "Couldn't resolve the case",
          )
        }
      >
        <div className="space-y-1.5">
          <Select
            label="Outcome"
            value={outcome}
            options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => setOutcome(v as ResolutionOutcome)}
          />
          <p className="text-[12px] text-ink-3">{OUTCOMES.find((o) => o.value === outcome)?.hint}</p>
        </div>
        {recovers ? (
          <Field
            label={`Amount recovered (${kase.currency})`}
            htmlFor="resolve-amount"
            hint="Prefilled with the value in dispute. Change it to what the supplier actually credited."
            error={amountError ?? undefined}
          >
            <Input
              id="resolve-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(amountError)}
            />
          </Field>
        ) : null}
        <Field label="Note" htmlFor="resolve-comment" hint="Optional. For example: supplier issued a credit note for 10 units.">
          <Textarea id="resolve-comment" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "archive"}
        title="Archive this case?"
        description="Archived cases are hidden from the default list and can't be analyzed. Pending or approved supplier emails for this case are expired so nothing is sent. You can reopen it later."
        confirmLabel="Archive case"
        confirmVariant="danger"
        onClose={() => setDialog(null)}
        onConfirm={() => act(() => archive({ caseId: kase.id, reason: text.trim() || undefined }).unwrap(), "Case archived", "Couldn't archive the case")}
      >
        <Field label="Reason" htmlFor="archive-reason" hint="Optional. Saved in the audit trail, e.g. Duplicate of OW-2026-0003.">
          <Textarea id="archive-reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reopen"}
        title="Reopen this case?"
        description={analyzed ? "It returns to Needs review so findings can be checked again." : "It returns to Draft so documents can be added."}
        confirmLabel="Reopen case"
        onClose={() => setDialog(null)}
        onConfirm={() => act(() => reopen({ caseId: kase.id, reason: text.trim() || undefined }).unwrap(), "Case reopened", "Couldn't reopen the case")}
      >
        <Field label="Reason" htmlFor="reopen-reason" hint="Optional. Saved in the audit trail.">
          <Textarea id="reopen-reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "notes"}
        title="Internal note"
        description="Visible to your workspace only. Never included in supplier emails."
        confirmLabel="Save note"
        onClose={() => setDialog(null)}
        onConfirm={() => act(() => update({ caseId: kase.id, body: { notes: notes.trim() || null } }).unwrap(), "Note saved", "Couldn't save the note")}
      >
        <Field label="Note" htmlFor="case-notes">
          <Textarea id="case-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
