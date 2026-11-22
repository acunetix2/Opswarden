"""Invoices by email.

Each workspace can turn on an address like `invoices+k3x7...@inbox.example.com`.
A Cloudflare Email Worker posts every message sent there to the API with the
shared AUTOMATION_SECRET. OpsWarden then:

- files each attachment through smart intake (same validation, reading and routing
  as the drop zone), or
- if the subject names a case that already has a supplier letter out, records the
  message as the supplier's reply (and handles a credit note in it).

The address token is an HMAC of the workspace id and a nonce, keyed with SECRET_KEY.
Only its SHA-256 is stored. Anyone with the address can file documents, so only
admins see it and they can replace it at any time.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage as MimeMessage
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.workspace import Workspace, WorkspaceMember
from app.services import audit_service, followup_service, intake_service, upload_rules

log = get_logger("opswarden.inbound")

LOCAL_PART = "invoices"
MAX_ATTACHMENTS = 10
MAX_MESSAGE_BYTES = 30 * 1024 * 1024
MAX_PER_HOUR = 60
_TOKEN_RE = re.compile(rf"{LOCAL_PART}\+([a-z2-7]{{20}})@", re.IGNORECASE)
_CASE_RE = re.compile(r"\bOW-\d{4}-\d{3,6}\b", re.IGNORECASE)


class InboundRejected(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass
class InboundResult:
    workspace_id: str
    filed: list[intake_service.Filed] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)
    reply: dict | None = None
    ignored: str | None = None

    @property
    def run_jobs(self) -> list[tuple[str, str]]:
        return [(f.decision.case.id, f.run_id) for f in self.filed if f.run_id]


# -- addresses ------------------------------------------------------------------------------
def available() -> bool:
    return bool(settings.inbound_email_domain.strip() and settings.automation_secret)


def _token(workspace_id: str, nonce: str) -> str:
    digest = hmac.new(settings.secret_key.encode(), f"inbound:{workspace_id}:{nonce}".encode(), hashlib.sha256).digest()
    return base64.b32encode(digest).decode().lower()[:20]


def _hash(token: str) -> str:
    return hashlib.sha256(token.lower().encode()).hexdigest()


def address_for(ws: Workspace) -> str | None:
    if not available() or not ws.inbound_nonce:
        return None
    return f"{LOCAL_PART}+{_token(ws.id, ws.inbound_nonce)}@{settings.inbound_email_domain.strip().lower()}"


def enable(db: Session, ws: Workspace, owner_id: str) -> str | None:
    """Turn the inbox on, or replace the address. The old address stops working at once."""
    ws.inbound_nonce = secrets.token_hex(8)
    ws.inbound_token_hash = _hash(_token(ws.id, ws.inbound_nonce))
    ws.inbound_owner_id = owner_id
    db.add(ws)
    return address_for(ws)


def disable(db: Session, ws: Workspace) -> None:
    ws.inbound_nonce = ws.inbound_token_hash = ws.inbound_owner_id = None
    db.add(ws)


def workspace_for_address(db: Session, *addresses: str) -> Workspace | None:
    for addr in addresses:
        m = _TOKEN_RE.search(addr or "")
        if m:
            ws = db.execute(select(Workspace).where(Workspace.inbound_token_hash == _hash(m.group(1)))).scalar_one_or_none()
            if ws is not None:
                return ws
    return None


# -- processing -----------------------------------------------------------------------------
def _actor(db: Session, ws: Workspace) -> str | None:
    """Mail is filed as the admin who turned the inbox on, while they're still an admin here."""
    admins = db.execute(
        select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.role == "admin")
    ).scalars().all()
    if ws.inbound_owner_id in admins:
        return ws.inbound_owner_id
    return admins[0] if admins else None


def _body_text(msg: MimeMessage) -> str:
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is None:
        return ""
    try:
        text = part.get_content()
    except (LookupError, ValueError):
        return ""
    if part.get_content_type() == "text/html":
        text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:5000]


def _attachments(msg: MimeMessage) -> list[tuple[str, str, bytes]]:
    out = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        filename = part.get_filename()
        if not filename:
            continue
        data = part.get_payload(decode=True) or b""
        out.append((filename, part.get_content_type(), data))
    return out


def _ours(msg: MimeMessage) -> bool:
    """Our own mail (bounces, auto-replies, loops) is never processed."""
    if msg.get("X-OpsWarden-Idempotency-Key"):
        return True
    auto = (msg.get("Auto-Submitted") or "no").strip().lower()
    if auto != "no":
        return True
    sender = parseaddr(msg.get("From", ""))[1].lower()
    ours = parseaddr(settings.smtp_from)[1].lower()
    return bool(ours) and sender == ours


def _seen(db: Session, workspace_id: str, message_key: str) -> bool:
    rows = db.execute(
        select(AuditEvent.event_payload_json).where(
            AuditEvent.workspace_id == workspace_id,
            AuditEvent.event_type == "inbound.email_received",
            AuditEvent.event_payload_json.contains(message_key),
        ).limit(1)
    ).first()
    return rows is not None


def _recent_count(db: Session, workspace_id: str) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    return db.execute(
        select(func.count(AuditEvent.id)).where(
            AuditEvent.workspace_id == workspace_id,
            AuditEvent.event_type == "inbound.email_received",
            AuditEvent.created_at >= since,
        )
    ).scalar_one()


def process_email(db: Session, raw: bytes, *, recipient: str | None = None, workspace: Workspace | None = None) -> InboundResult:
    """Handle one email. `workspace` is given for test uploads by a member; otherwise the
    recipient address decides. Raises InboundRejected for mail that can't be accepted."""
    if len(raw) > MAX_MESSAGE_BYTES:
        raise InboundRejected(413, "MESSAGE_TOO_LARGE", "The email is too large.")
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    if workspace is None:
        headers = [recipient or ""] + [a for _n, a in getaddresses(
            msg.get_all("To", []) + msg.get_all("Cc", []) + msg.get_all("Delivered-To", []) + msg.get_all("X-Original-To", [])
        )]
        workspace = workspace_for_address(db, *headers)
        if workspace is None:
            raise InboundRejected(404, "UNKNOWN_ADDRESS", "No OpsWarden workspace uses this address.")
    result = InboundResult(workspace_id=workspace.id)
    if _ours(msg):
        result.ignored = "automatic_or_own_message"
        return result

    sender = parseaddr(msg.get("From", ""))[1].lower()[:200]
    subject = str(msg.get("Subject", "")).strip()[:300]
    message_key = "mid:" + hashlib.sha256((msg.get("Message-ID") or "").encode() + raw[:4096]).hexdigest()[:32]
    if _seen(db, workspace.id, message_key):
        result.ignored = "duplicate"
        return result
    if _recent_count(db, workspace.id) >= MAX_PER_HOUR:
        raise InboundRejected(429, "TOO_MANY_EMAILS", "This inbox received too many emails in the last hour.")
    actor = _actor(db, workspace)
    if actor is None:
        raise InboundRejected(409, "NO_ADMIN", "The workspace has no admin to file documents as.")

    body = _body_text(msg)
    attachments = _attachments(msg)[:MAX_ATTACHMENTS]

    # A reply about a case we wrote to: the case number is in the subject (or quoted body).
    case = None
    for number in _CASE_RE.findall(subject) or _CASE_RE.findall(body[:3000]):
        case = db.execute(
            select(Case).where(Case.workspace_id == workspace.id, Case.case_number == number.upper())
        ).scalar_one_or_none()
        if case is not None:
            break
    if case is not None and followup_service.sent_letters(db, case.id):
        result.reply = followup_service.record_reply(
            db, case, sender=sender, subject=subject, body=body, attachments=attachments, actor_id=actor
        )
    else:
        for filename, mime, data in attachments:
            if upload_rules.looks_like_credit_note(filename):
                result.rejected.append({"filename": filename[:200], "code": "CREDIT_NOTE_WITHOUT_CASE"})
                continue
            try:
                result.filed.append(intake_service.file_document(
                    db, workspace.id, actor,
                    filename=filename, data=data, declared_mime=mime,
                    document_type=upload_rules.guess_document_type(filename, subject), via="email",
                ))
            except intake_service.IntakeError as exc:
                db.rollback()
                result.rejected.append({"filename": filename[:200], "code": exc.code})

    audit_service.record_event(
        db,
        workspace_id=workspace.id,
        case_id=case.id if result.reply else None,
        event_type="inbound.email_received",
        actor_type="integration",
        payload={
            "message": message_key,
            "from": sender,
            "subject": subject[:200],
            "attachments": len(attachments),
            "filed": [{"case_number": f.decision.case.case_number, "document_type": f.document.document_type} for f in result.filed],
            "rejected": result.rejected,
            "reply_to_case": case.case_number if result.reply else None,
        },
        commit=False,
    )
    db.commit()
    return result
