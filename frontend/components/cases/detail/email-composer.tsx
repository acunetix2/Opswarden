"use client";

import Link from "next/link";
import { ApprovalStatusBadge } from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toAppError } from "@/lib/api-error";
import { downloadText } from "@/lib/download";
import { relativeTime } from "@/lib/format";
import type { Approval, Case } from "@/lib/types";
import { useEmailDraftMutation, useRequestApprovalMutation } from "@/store/api";
import { draftDiscarded, draftEdited, draftStarted, draftSubmitted } from "@/store/drafts-slice";
import { useAppDispatch, useAppSelector, useToast } from "@/store/hooks";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailComposerProps {
  kase: Case;
  analyzed: boolean;
  approvals: Approval[];
  emailConfigured: boolean;
  canDraft: boolean;
  canRequest: boolean;
}

/** Supplier clarification email: generate → edit → request approval. Never sends directly. */
export function EmailComposer({ kase, analyzed, approvals, emailConfigured, canDraft, canRequest }: EmailComposerProps) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const draft = useAppSelector((s) => s.drafts[kase.id]);
  const [generate, genState] = useEmailDraftMutation();
  const [requestApproval, reqState] = useRequestApprovalMutation();

  const recipient = draft?.recipient.trim() ?? "";
  // The address is the one filled from the register, untouched.
  const fromRegister = Boolean(recipient) && draft?.recipientSource === "register";
  const fromDocument = Boolean(recipient) && draft?.recipientSource === "document";
  const recipientInvalid = recipient !== "" && !EMAIL_RE.test(recipient);
  const locked = Boolean(draft?.submittedApprovalId);
  const closed = kase.status === "resolved" || kase.status === "archived";

  async function onGenerate() {
    try {
      const d = await generate(kase.id).unwrap();
      dispatch(
        draftStarted({
          caseId: kase.id,
          recommendationId: d.recommendation_id,
          subject: d.subject,
          body: d.body,
          recipient: d.recipient,
          // Filled from the supplier register. An address a person entered there is already trusted;
          // one OpsWarden read from a supplier document needs the person to confirm it.
          recipientVerified: Boolean(d.recipient) && d.recipient_source !== "document",
          recipientSource: d.recipient ? (d.recipient_source ?? "register") : null,
          aiModel: d.ai_assisted ? d.model : null,
        }),
      );
    } catch (err) {
      toast("danger", "Couldn't prepare the email", toAppError(err).message);
    }
  }

  async function onRequest() {
    if (!draft) return;
    try {
      const res = await requestApproval({
        caseId: kase.id,
        recommendationId: draft.recommendationId,
        recipient: recipient || null,
        subject: draft.subject,
        body: draft.body,
      }).unwrap();
      dispatch(draftSubmitted({ caseId: kase.id, approvalId: res.approval_id }));
      toast("success", "Sent for approval", "A reviewer must approve it before anything goes to the supplier.");
    } catch (err) {
      toast("danger", "Couldn't request approval", toAppError(err).message);
    }
  }

  async function onCopy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    toast("info", "Draft copied to clipboard");
  }

  const memoInput =
    "w-full border-0 bg-transparent px-0 py-1 text-[14px] text-ink placeholder:text-ink-3/70 focus-visible:outline-none disabled:text-ink-2";

  return (
    <Card>
      <CardHeader
        index="C"
        title="Supplier letter"
        description="Drafted only from validated findings. A person edits it; an authorized reviewer approves it."
        action={
          draft ? (
            <span className={draft.aiModel ? "label text-brand-ink" : "label"}>
              {draft.aiModel ? "AI-assisted" : "Template"}
            </span>
          ) : null
        }
      />
      <CardBody className="space-y-5">
        {!emailConfigured ? (
          <Notice tone="info">
            Email sending isn&apos;t connected. After approval, copy or export the approved letter and send it yourself.
            OpsWarden won&apos;t claim it was sent.
          </Notice>
        ) : null}

        {approvals.length ? (
          <div>
            <p className="label mb-2">Approval history</p>
            <ul className="divide-y divide-line border-y border-line">
              {approvals.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                  <ApprovalStatusBadge status={a.status} />
                  <span className="min-w-0 flex-1 truncate text-ink">{a.subject}</span>
                  <span className="font-mono text-[11px] text-ink-3">{relativeTime(a.created_at)}</span>
                  <Link href="/app/approvals" className="text-[12px] font-medium text-brand-ink hover:underline">
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!draft ? (
          <div className="grid gap-4 rounded-[12px] border border-dashed border-line-strong bg-canvas/50 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              {analyzed
                ? "Prepare a clarification letter listing the open findings. You'll review and edit every word before asking for approval."
                : "Run the analysis first. The letter is written only from validated findings."}
            </p>
            {canDraft && !closed ? (
              <Button onClick={onGenerate} loading={genState.isLoading} disabled={!analyzed}>
                Prepare letter
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {/* The letter itself: memo header over ruled paper. */}
            <div className="overflow-hidden rounded-[12px] border border-line bg-canvas">
              <div className="divide-y divide-line border-b border-line bg-surface px-5">
                <div className="grid grid-cols-[5rem_1fr] items-center gap-3 py-2">
                  <label htmlFor="email-recipient" className="label">To</label>
                  <input
                    id="email-recipient"
                    type="email"
                    value={draft.recipient}
                    disabled={locked}
                    onChange={(e) => dispatch(draftEdited({ caseId: kase.id, changes: { recipient: e.target.value } }))}
                    placeholder="Verified supplier address (optional)"
                    aria-invalid={recipientInvalid || undefined}
                    aria-describedby="email-recipient-hint"
                    className={memoInput}
                  />
                </div>
                <div className="grid grid-cols-[5rem_1fr] items-center gap-3 py-2">
                  <label htmlFor="email-subject" className="label">Subject</label>
                  <input
                    id="email-subject"
                    value={draft.subject}
                    disabled={locked}
                    onChange={(e) => dispatch(draftEdited({ caseId: kase.id, changes: { subject: e.target.value } }))}
                    className={`${memoInput} font-medium`}
                  />
                </div>
                <div className="grid grid-cols-[5rem_1fr] gap-3 py-2">
                  <span className="label">Re</span>
                  <span className="font-mono text-[12px] text-ink-2">
                    {kase.case_number} · {kase.supplier_reference ?? "no PO reference"}
                  </span>
                </div>
              </div>
              <label htmlFor="email-body" className="sr-only">Message</label>
              <textarea
                id="email-body"
                value={draft.body}
                disabled={locked}
                rows={13}
                onChange={(e) => dispatch(draftEdited({ caseId: kase.id, changes: { body: e.target.value } }))}
                // Serif body on 28px rules, so the draft reads like a letter, not a form field.
                className="ruled block w-full resize-y border-0 bg-transparent px-5 pt-[6px] pb-5 font-display text-[18px] leading-[28px] text-ink focus-visible:outline-none disabled:text-ink-2"
              />
            </div>
            <p id="email-recipient-hint" className={recipientInvalid ? "text-[12px] text-danger" : "text-[12px] text-ink-3"}>
              {recipientInvalid
                ? "Enter a valid email address."
                : fromRegister
                  ? `Filled in from the supplier register for ${kase.supplier_name ?? "this supplier"}.`
                  : fromDocument
                    ? `Filled in from a ${kase.supplier_name ?? "supplier"} document OpsWarden read. Check it is the supplier's accounts address before sending.`
                    : recipient
                      ? "Confirm this address belongs to the supplier."
                      : "No address in the supplier register yet. Add one under Suppliers, enter one you've confirmed, or leave it blank to export the letter."}
            </p>
            {recipient && !recipientInvalid && !locked && !fromRegister ? (
              <Checkbox
                checked={draft.recipientVerified}
                onChange={(v) => dispatch(draftEdited({ caseId: kase.id, changes: { recipientVerified: v } }))}
                label={`I've verified this address belongs to ${kase.supplier_name ?? "the supplier"}.`}
              />
            ) : null}

            {locked ? (
              <Notice tone="success" title="Submitted for approval" action={<Link href="/app/approvals" className="text-[12px] font-medium text-brand-ink hover:underline">Open →</Link>}>
                This exact letter is locked by a content hash. Editing it would need a new approval.
              </Notice>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {canRequest && !locked ? (
                <Button
                  variant="accent"
                  onClick={onRequest}
                  loading={reqState.isLoading}
                  disabled={
                    !draft.subject.trim() ||
                    !draft.body.trim() ||
                    recipientInvalid ||
                    (Boolean(recipient) && !fromRegister && !draft.recipientVerified)
                  }
                >
                  Request approval
                </Button>
              ) : null}
              <Button variant="secondary" onClick={onCopy}>
                Copy
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadText(`${kase.case_number}-supplier-letter.txt`, `To: ${recipient || "(not set)"}\nSubject: ${draft.subject}\n\n${draft.body}`)}
              >
                Export .txt
              </Button>
              <Button variant="ghost" className="ml-auto" onClick={() => dispatch(draftDiscarded(kase.id))}>
                {locked ? "Close" : "Discard draft"}
              </Button>
            </div>
            {!canRequest ? <p className="text-[12px] text-ink-3">Your role can prepare drafts but can&apos;t request approval. Ask a reviewer.</p> : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
