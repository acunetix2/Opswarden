"""Supplier follow-up: reminders when a supplier goes quiet, and replies that close the loop.

After a supplier letter is sent the case waits for the supplier (status `in_progress`).
- No reply after `follow_up_days` -> OpsWarden drafts a reminder and queues it for
  approval (at most two reminders per case). Nothing is sent without an approver.
- A reply arrives (by email to the workspace inbox) -> recorded on the case; reminders stop.
- The reply carries a credit note -> its total is read like any other document. When
  it is in the case currency and no more than the value in dispute, the case closes as
  "recovered" with that amount. Otherwise reviewers are asked to check it.

The reminder text is a fixed template plus the original approved letter, so it adds
no new figures.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db import new_uuid
from app.integrations.storage.provider import get_storage
from app.models.approval import Approval
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.document import Document
from app.models.finding import Finding
from app.models.recommendation import Recommendation
from app.services import audit_service, case_service, policy_service, upload_rules
from app.services.normalization import parse_decimal

log = get_logger("opswarden.followup")

LETTER_TYPES = ("supplier_clarification_email", "supplier_reminder")
MAX_REMINDERS = 2
_ACTIVE = ("open", "confirmed", "needs_review")
_CENT = Decimal("0.01")


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def sent_letters(db: Session, case_id: str) -> list[Approval]:
    return list(
        db.execute(
            select(Approval)
            .where(Approval.case_id == case_id, Approval.action_type.in_(LETTER_TYPES), Approval.status == "executed")
            .order_by(Approval.executed_at)
        ).scalars()
    )


def last_reply_at(db: Session, case_id: str) -> datetime | None:
    row = db.execute(
        select(AuditEvent.created_at)
        .where(AuditEvent.case_id == case_id, AuditEvent.event_type == "supplier.replied")
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    ).first()
    return _utc(row[0]) if row else None


def exposure_in(db: Session, case: Case) -> Decimal:
    """Value in dispute on the case, in the case currency."""
    total = Decimal("0")
    for f in db.execute(select(Finding).where(Finding.case_id == case.id, Finding.status.in_(_ACTIVE))).scalars():
        if f.impact_amount is not None and (f.currency or case.currency) == case.currency:
            total += abs(Decimal(str(f.impact_amount)))
    return total


# -- reminders ----------------------------------------------------------------------------
def reminder_body(case: Case, original: dict, sent_at: datetime, supplier: str | None) -> str:
    when = sent_at.strftime("%d %B %Y").lstrip("0")
    ref = f" (purchase order {case.supplier_reference})" if case.supplier_reference else ""
    return (
        f"Hello {supplier or 'there'},\n\n"
        f"We wrote to you on {when} about {case.case_number}{ref} and haven't received a reply yet.\n\n"
        "Please reply to this email with a credit note or a corrected invoice, or tell us if you need "
        "anything from us to resolve it.\n\n"
        "Our original message is below for reference.\n\n"
        "---\n\n"
        f"{original.get('body', '').strip()}"
    )


def draft_reminder(db: Session, case: Case, last: Approval) -> Approval:
    from app.services import automation_service

    original = json.loads(last.action_payload_json)
    subject = original.get("subject") or case.case_number
    if not subject.lower().startswith("reminder:"):
        subject = f"Reminder: {subject}"
    payload = {
        "subject": subject[:300],
        "body": reminder_body(case, original, _utc(last.executed_at) or datetime.now(timezone.utc), case.supplier_name),
        "recipient": original.get("recipient"),
        "case_id": case.id,
    }
    if original.get("recipient_source"):
        payload["recipient_source"] = original["recipient_source"]
    rec = Recommendation(
        workspace_id=case.workspace_id,
        case_id=case.id,
        recommendation_type="supplier_reminder",
        summary=subject[:300],
        rationale=f"No reply from the supplier since the letter of {_utc(last.executed_at):%Y-%m-%d}.",
        payload_json=json.dumps(payload),
        status="draft",
        generated_by="builtin",
        model="template",
    )
    db.add(rec)
    db.flush()
    audit_service.record_event(
        db, workspace_id=case.workspace_id, case_id=case.id, event_type="recommendation.generated",
        actor_type="agent", payload={"recommendation_id": rec.id, "type": rec.recommendation_type, "provider": "builtin"},
        commit=False,
    )
    return automation_service.queue_for_approval(db, rec, requested_by=case.owner_user_id, actor_type="agent")


def due_reminder(db: Session, case: Case, now: datetime) -> Approval | None:
    """The letter a reminder would follow up, if one is due now."""
    auto = policy_service.get_automation(db, case.workspace_id)
    if not auto.follow_up_reminders or case.status != "in_progress":
        return None
    letters = sent_letters(db, case.id)
    if not letters:
        return None
    reminders = [a for a in letters if a.action_type == "supplier_reminder"]
    if len(reminders) >= MAX_REMINDERS:
        return None
    first_sent = _utc(letters[0].executed_at)
    replied = last_reply_at(db, case.id)
    if replied and first_sent and replied >= first_sent:
        return None
    last = letters[-1]
    if not last.executed_at or now - _utc(last.executed_at) < timedelta(days=auto.follow_up_days):
        return None
    waiting = db.execute(
        select(Approval.id).where(Approval.case_id == case.id, Approval.status.in_(("pending", "approved"))).limit(1)
    ).first()
    return None if waiting else last


def run_due(db: Session, now: datetime | None = None, workspace_id: str | None = None) -> dict:
    """Draft every reminder that is due. Safe to run as often as you like."""
    from app.services import automation_service

    now = now or datetime.now(timezone.utc)
    stmt = select(Case).where(Case.status == "in_progress").limit(1000)
    if workspace_id:
        stmt = stmt.where(Case.workspace_id == workspace_id)
    drafted = 0
    for case in db.execute(stmt).scalars().all():
        last = due_reminder(db, case, now)
        if last is None:
            continue
        try:
            with db.begin_nested():
                approval = draft_reminder(db, case, last)
                if policy_service.get_automation(db, case.workspace_id).notify_reviewers:
                    automation_service.notify_people(
                        db, case, "approval", f"{case.case_number} reminder waiting for approval",
                        [
                            f"{case.supplier_name or 'The supplier'} hasn't replied to the letter about {case.case_number}.",
                            "OpsWarden drafted a reminder. Nothing has been sent yet.",
                        ],
                        "/app/approvals", approval.id,
                    )
            drafted += 1
        except Exception as exc:  # one case failing never blocks the others
            log.error("Reminder skipped for case %s (%s)", case.id, type(exc).__name__)
    db.commit()
    return {"reminders_drafted": drafted}


# -- replies -----------------------------------------------------------------------------
def _store_credit_note(db: Session, case: Case, actor_id: str, filename: str, mime: str, data: bytes) -> Document:
    key = f"{case.workspace_id}_{new_uuid()}"
    get_storage().put(key, data)
    doc = Document(
        workspace_id=case.workspace_id,
        case_id=case.id,
        document_type="credit_note",
        storage_key=key,
        original_filename=filename[:300],
        mime_type=mime,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        processing_status="received",  # kept as evidence; not part of the three-way match
        uploaded_by=actor_id,
    )
    db.add(doc)
    db.flush()
    return doc


def read_credit_amount(filename: str, mime: str, data: bytes) -> tuple[Decimal | None, str | None]:
    """The credit note's total and currency, read like any invoice. (None, None) if unreadable."""
    from app.services.extraction_service import ExtractionError, extract_document

    try:
        doc, _conf, _p, _m = extract_document(data, mime, filename, "invoice")
    except ExtractionError:
        return None, None
    amount = parse_decimal(doc.grand_total) or parse_decimal(doc.subtotal)
    if amount is None or not amount.is_finite():
        return None, (doc.currency or "").upper()[:3] or None
    return abs(amount).quantize(_CENT), (doc.currency or "").upper()[:3] or None


def record_reply(
    db: Session,
    case: Case,
    *,
    sender: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, str, bytes]],
    actor_id: str,
) -> dict:
    """Record a supplier's reply on the case. Flushes, doesn't commit. Returns what happened."""
    from app.core.config import settings
    from app.services import automation_service

    auto = policy_service.get_automation(db, case.workspace_id)
    result: dict = {"case_id": case.id, "case_number": case.case_number, "credit_note": None, "resolved": False}
    credit_doc = None
    amount = currency = None
    for filename, declared, data in attachments:
        if not upload_rules.looks_like_credit_note(filename, subject, body):
            continue
        if not data or len(data) > settings.max_upload_bytes:
            continue
        try:
            mime = upload_rules.detect_mime(filename, declared, data)
        except upload_rules.UnsupportedFile:
            continue
        credit_doc = _store_credit_note(db, case, actor_id, filename, mime, data)
        amount, currency = read_credit_amount(filename, mime, data)
        result["credit_note"] = {"document_id": credit_doc.id, "amount": str(amount) if amount is not None else None, "currency": currency}
        break

    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="supplier.replied",
        actor_type="integration",
        payload={
            "from": sender[:200],
            "subject": subject[:200],
            "attachments": len(attachments),
            "credit_note_document_id": credit_doc.id if credit_doc else None,
            "credited_amount": str(amount) if amount is not None else None,
        },
        commit=False,
    )

    exposure = exposure_in(db, case)
    currency_ok = currency in (None, case.currency)
    can_close = (
        auto.record_credit_notes
        and amount is not None
        and amount > 0
        and currency_ok
        and exposure > 0
        and amount <= exposure + _CENT
        and case_service.can_transition(case.status, "resolved")
    )
    if can_close:
        note = f"Closed by OpsWarden: credit note {credit_doc.original_filename} from {sender} for {amount} {case.currency}."
        case.resolution_outcome = "recovered"
        case.recovered_amount = amount
        case.resolution_note = note[:2000]
        case_service.set_status(db, case, "resolved", actor_type="agent")
        audit_service.record_event(
            db, workspace_id=case.workspace_id, case_id=case.id, event_type="case.resolved", actor_type="agent",
            payload={"outcome": "recovered", "recovered_amount": str(amount), "currency": case.currency, "automatic": True,
                     "comment": note[:500]},
            commit=False,
        )
        result["resolved"] = True
        lines = [
            f"{case.supplier_name or 'The supplier'} replied on {case.case_number} with a credit note for {amount} {case.currency}.",
            "OpsWarden recorded it as recovered and closed the case. Reopen it if the amount isn't right.",
        ]
        kind = "recovered"
    else:
        why = ""
        if amount is not None and not currency_ok:
            why = f" The credit note is in {currency}, not {case.currency}, so it wasn't recorded automatically."
        elif amount is not None and amount > exposure + _CENT:
            why = " The credited amount is more than the value in dispute, so it wasn't recorded automatically."
        elif credit_doc is not None and amount is None:
            why = " OpsWarden couldn't read the amount on the credit note."
        lines = [
            f"{case.supplier_name or 'The supplier'} replied on {case.case_number}." + why,
            "Open the case to read the reply and decide what happens next.",
        ]
        kind = "reply"
    if auto.notify_reviewers:
        automation_service.notify_people(
            db, case, kind, f"{case.case_number}: supplier replied", lines,
            f"/app/investigations/{case.id}", f"reply:{case.id}:{new_uuid()}",
        )
    return result
