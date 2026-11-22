"""What OpsWarden does on its own after an analysis, so people only handle decisions.

Runs after the bounded analysis finishes (outside the orchestrator, because drafting
may polish wording with a model). Each step is plain code and follows the
workspace's automation switches:

- documents agree, nothing to review -> the case is closed as "no discrepancy";
- findings, nothing uncertain        -> the supplier letter is drafted and queued
                                         for approval, and approvers are emailed;
- something needs a person's check   -> reviewers are emailed.

It never sends anything to a supplier. Letters wait for an approver, who sees the
exact text and recipient (payload hash lock).
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.db import new_uuid
from app.integrations.email import templates
from app.integrations.email.base import EmailMessage
from app.integrations.email.provider import get_email_provider
from app.models.approval import Approval
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.document import Document
from app.models.extraction import ExtractedField
from app.models.finding import Finding
from app.models.recommendation import Recommendation
from app.models.registry import Supplier
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.services import approval_service, audit_service, case_service, investigation_service, policy_service

log = get_logger("opswarden.automation")

_ACTIVE = ("open", "confirmed", "needs_review")
_ALL_TYPES = {"purchase_order", "delivery_receipt", "invoice"}
_NOTIFY_COOLDOWN = timedelta(hours=1)
# kind -> (email heading, button label)
_NOTICE = {
    "approval": ("A supplier letter is waiting for your approval", "Review the letter"),
    "review": ("A case needs your review", "Open the case"),
    "reply": ("A supplier replied", "Open the case"),
    "recovered": ("A supplier credit note closed a case", "Open the case"),
}
CLEAN_NOTE = "Closed by OpsWarden: the purchase order, delivery receipt and invoice agree."


# -- letters ---------------------------------------------------------------------------
def supplier_for_case(db: Session, case: Case) -> Supplier | None:
    """The registered supplier for a case: the linked one, or one registered under the
    same name in this workspace (which is then linked). Never another workspace's."""
    if case.supplier_id:
        supplier = db.get(Supplier, case.supplier_id)
        return supplier if supplier and supplier.workspace_id == case.workspace_id else None
    from app.services.normalization import normalize_text

    norm = normalize_text(case.supplier_name)
    if not norm:
        return None
    supplier = db.execute(
        select(Supplier).where(Supplier.workspace_id == case.workspace_id, Supplier.normalized_name == norm).limit(1)
    ).scalar_one_or_none()
    if supplier is not None:
        case.supplier_id = supplier.id
        db.add(case)
    return supplier


def draft_letter(db: Session, case: Case) -> tuple[Recommendation, investigation_service.EmailDraftResult, str | None]:
    """Draft the supplier letter from the case's findings. Flushes, doesn't commit."""
    findings = db.execute(select(Finding).where(Finding.case_id == case.id)).scalars().all()
    draft = investigation_service.draft_supplier_email(
        case.case_number, case.supplier_name, case.supplier_reference, findings, case.currency
    )
    rationale = investigation_service.build_summary(case.title, case.supplier_name, findings)
    recipient = None
    recipient_source = None
    supplier = supplier_for_case(db, case)
    if supplier is not None:
        if supplier.contact_email:
            recipient = supplier.contact_email
            recipient_source = supplier.contact_email_source or "register"
    payload = {"subject": draft.subject, "body": draft.body, "recipient": recipient, "case_id": case.id}
    if recipient_source == "document":
        # Part of the hashed payload; the approval screen warns the approver to check it.
        payload["recipient_source"] = "document"
    rec = Recommendation(
        workspace_id=case.workspace_id,
        case_id=case.id,
        recommendation_type="supplier_clarification_email",
        summary=draft.subject,
        rationale=rationale,
        payload_json=json.dumps(payload),
        status="draft",
        generated_by=draft.provider,
        model=draft.model,
    )
    db.add(rec)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="recommendation.generated",
        actor_type="agent",
        payload={
            "recommendation_id": rec.id,
            "type": rec.recommendation_type,
            "provider": draft.provider,
            "model": draft.model,
            "ai_assisted": draft.ai_assisted,
            "fallback_reason": draft.fallback_reason,
        },
        commit=False,
    )
    return rec, draft, recipient


def queue_for_approval(db: Session, rec: Recommendation, requested_by: str, actor_type: str) -> Approval:
    """Lock the letter's exact payload and put it in the approval queue. Flushes, doesn't commit."""
    stored = json.loads(rec.payload_json)
    if actor_type != "user":
        stored["automatic"] = True  # shown as "OpsWarden (automatic)"; part of the hashed payload
    phash = approval_service.payload_hash(stored)
    approval = Approval(
        workspace_id=rec.workspace_id,
        case_id=rec.case_id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        action_payload_json=json.dumps(stored),
        payload_hash=phash,
        status="pending",
        requested_by=requested_by,
        idempotency_key=new_uuid(),
    )
    db.add(approval)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=rec.workspace_id,
        case_id=rec.case_id,
        event_type="approval.requested",
        actor_type=actor_type,
        actor_id=requested_by if actor_type == "user" else None,
        payload={"approval_id": approval.id, "payload_hash": phash, "automatic": actor_type != "user"},
        commit=False,
    )
    return approval


# -- notifications ---------------------------------------------------------------------
def _exposure_text(findings: list[Finding], currency: str) -> str | None:
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for f in findings:
        if f.impact_amount is not None:
            totals[f.currency or currency] += abs(Decimal(str(f.impact_amount)))
    parts = [f"{amount.quantize(Decimal('0.01')):,} {cur}" for cur, amount in totals.items() if amount > 0]
    return " + ".join(parts) or None


def _recently_notified(db: Session, case_id: str, kind: str) -> bool:
    since = datetime.now(timezone.utc) - _NOTIFY_COOLDOWN
    rows = db.execute(
        select(AuditEvent.event_payload_json).where(
            AuditEvent.case_id == case_id,
            AuditEvent.event_type == "notification.emailed",
            AuditEvent.created_at >= since,
        )
    ).scalars().all()
    return any(json.loads(r or "{}").get("kind") == kind for r in rows)


def notify_people(db: Session, case: Case, kind: str, subject: str, lines: list[str], path: str, key: str) -> int:
    """Email the workspace's admins and reviewers (approvers only for approvals).
    Returns how many emails went out. Never raises; a failed email is logged."""
    provider = get_email_provider()
    # Replies are news every time; only the "waiting" kinds are rate limited.
    if not provider.configured or (kind in ("approval", "review") and _recently_notified(db, case.id, kind)):
        return 0
    roles = {"admin"}
    if kind != "approval" or policy_service.get_policy(db, case.workspace_id).reviewers_can_approve:
        roles.add("reviewer")
    people = db.execute(
        select(User)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == case.workspace_id, WorkspaceMember.role.in_(roles))
    ).scalars().all()
    link = f"{settings.frontend_origin.rstrip('/')}{path}"
    title, button = _NOTICE.get(kind, ("Something needs your attention", "Open OpsWarden"))
    facts = [templates.Fact("Case", case.case_number)]
    if case.supplier_name:
        facts.append(templates.Fact("Supplier", case.supplier_name))
    if case.supplier_reference:
        facts.append(templates.Fact("Purchase order", case.supplier_reference))
    sent = 0
    for person in people:
        first = (person.full_name or "").split()[0] if (person.full_name or "").split() else "there"
        mail = templates.render_notice(
            title=title,
            preheader=lines[0] if lines else title,
            greeting=f"Hi {first},",
            paragraphs=lines,
            facts=facts,
            button=(button, link),
            reason="You received this because you review cases in this OpsWarden workspace. At most one email per case per hour.",
        )
        try:
            provider.send(
                EmailMessage(recipient=person.email, subject=subject, body=mail.text, html=mail.html),
                idempotency_key=f"{key}:{person.id}",
            )
            sent += 1
        except Exception:
            log.warning("Notification email to a workspace member could not be sent (case %s)", case.id)
    if sent:
        audit_service.record_event(
            db,
            workspace_id=case.workspace_id,
            case_id=case.id,
            event_type="notification.emailed",
            actor_type="system",
            payload={"kind": kind, "recipients": sent},
            commit=False,
        )
    return sent


# -- after an analysis -------------------------------------------------------------------
def _has_uncertain_fields(db: Session, case: Case) -> bool:
    return db.execute(
        select(ExtractedField.id)
        .join(Document, Document.id == ExtractedField.document_id)
        .where(Document.case_id == case.id, ExtractedField.review_status == "needs_review")
        .limit(1)
    ).first() is not None


def _step(db: Session, case: Case) -> list[str]:
    auto = policy_service.get_automation(db, case.workspace_id)
    actions: list[str] = []
    if case.status not in ("needs_review", "ready_for_approval"):
        return actions

    findings = db.execute(select(Finding).where(Finding.case_id == case.id)).scalars().all()
    active = [f for f in findings if f.status in _ACTIVE]
    types = set(db.execute(select(Document.document_type).where(Document.case_id == case.id)).scalars().all())
    label = f"{case.case_number}" + (f" ({case.supplier_name})" if case.supplier_name else "")

    if not active:
        clean = case.status == "ready_for_approval" and types >= _ALL_TYPES and not _has_uncertain_fields(db, case)
        if clean and auto.auto_resolve_clean:
            case.resolution_outcome = "no_discrepancy"
            case.recovered_amount = None
            case.resolution_note = CLEAN_NOTE
            case_service.set_status(db, case, "resolved", actor_type="agent")
            audit_service.record_event(
                db,
                workspace_id=case.workspace_id,
                case_id=case.id,
                event_type="case.resolved",
                actor_type="agent",
                payload={"outcome": "no_discrepancy", "comment": CLEAN_NOTE, "automatic": True, "currency": case.currency},
                commit=False,
            )
            actions.append("resolved")
        return actions

    exposure = _exposure_text(active, case.currency)
    found = f"OpsWarden finished checking {label} and found {len(active)} {'discrepancy' if len(active) == 1 else 'discrepancies'}" + (
        f" with {exposure} in dispute." if exposure else "."
    )
    open_approval = db.execute(
        select(Approval.id).where(Approval.case_id == case.id, Approval.status.in_(("pending", "approved"))).limit(1)
    ).first()

    if case.status == "ready_for_approval" and auto.auto_draft_letters and open_approval is None:
        rec, _draft, recipient = draft_letter(db, case)
        approval = queue_for_approval(db, rec, requested_by=case.owner_user_id, actor_type="agent")
        actions.append("letter_queued")
        if auto.notify_reviewers:
            unconfirmed = json.loads(rec.payload_json).get("recipient_source") == "document"
            lines = [
                found,
                "A letter to the supplier is drafted and waiting for your approval."
                + (
                    " Add the supplier's email address before sending."
                    if not recipient
                    else " The address was read from a supplier document, so check it before you approve."
                    if unconfirmed
                    else ""
                ),
                "Nothing has been sent to the supplier yet."
                + (" Approving sends it straight away." if auto.send_on_approval and recipient else ""),
            ]
            if notify_people(db, case, "approval", f"{case.case_number} letter waiting for approval", lines, "/app/approvals", approval.id):
                actions.append("reviewers_emailed")
    elif case.status == "needs_review" and auto.notify_reviewers:
        lines = [found, "Some findings or extracted fields need a person to check them before a letter can be prepared."]
        if notify_people(db, case, "review", f"{case.case_number} needs review", lines, f"/app/investigations/{case.id}", f"review:{case.id}:{new_uuid()}"):
            actions.append("reviewers_emailed")
    return actions


def after_analysis(db: Session, case_id: str, correlation_id: str | None) -> list[str]:
    """Run the follow-up steps and always record `automation.completed`, so the live
    progress view knows the run is over. A failure rolls back the follow-up only."""
    actions: list[str] = []
    failed = False
    try:
        case = db.get(Case, case_id)
        if case is not None:
            actions = _step(db, case)
            db.commit()
    except Exception as exc:
        # Type only: exception text can carry SQL parameters with document values.
        log.error("Follow-up after analysis failed for case %s (%s)", case_id, type(exc).__name__)
        db.rollback()
        actions, failed = [], True
    case = db.get(Case, case_id)
    if case is not None:
        audit_service.record_event(
            db,
            workspace_id=case.workspace_id,
            case_id=case.id,
            event_type="automation.completed",
            actor_type="agent",
            payload={"actions": actions, "status": case.status, **({"error_code": "FOLLOW_UP_FAILED"} if failed else {})},
            correlation_id=correlation_id,
            commit=False,
        )
        db.commit()
    return actions
