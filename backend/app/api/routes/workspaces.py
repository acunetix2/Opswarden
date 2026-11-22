"""Workspace-level read models: dashboard overview and members.

Every number here is derived from stored records. Nothing is hardcoded.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import json

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, workspace_context
from app.api.errors import unprocessable
from app.core.permissions import Permission
from app.db import get_db, utcnow
from app.services import audit_service, policy_service
from app.models.approval import Approval
from app.models.case import Case
from app.models.finding import Finding
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import (
    AttentionItem,
    MemberOut,
    MoneyAmount,
    OverviewMetrics,
    OverviewOut,
    RecentCase,
    SeriesPoint,
    NotificationOut,
    NotificationsOut,
    SupplierOut,
    WorkspaceSettingsOut,
    WorkspaceSettingsUpdate,
)
from app.agents.llm_provider import get_llm_provider
from app.services import inbound_service, ocr_service, recovery_service, stt_service, tts_service
from app.core.config import settings as app_settings
from app.integrations.email.provider import get_email_provider

router = APIRouter(tags=["workspaces"])

_CLOSED = {"resolved", "archived"}
_ACTIVE_FINDING = {"open", "confirmed", "needs_review"}


def _utc(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _money(totals: dict[str, Decimal]) -> list[MoneyAmount]:
    ordered = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    return [MoneyAmount(currency=c, amount=str(a.quantize(Decimal("0.01")))) for c, a in ordered if a > 0]


@router.get("/workspaces/{workspace_id}/overview", response_model=OverviewOut)
def overview(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> OverviewOut:
    ctx.require(Permission.READ_CASE)
    workspace = db.get(Workspace, workspace_id)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    cases = db.execute(select(Case).where(Case.workspace_id == workspace_id)).scalars().all()
    findings = db.execute(select(Finding).where(Finding.workspace_id == workspace_id)).scalars().all()
    pending = db.execute(
        select(Approval).where(Approval.workspace_id == workspace_id, Approval.status == "pending")
    ).scalars().all()

    case_by_id = {c.id: c for c in cases}
    open_cases = [c for c in cases if c.status not in _CLOSED]

    # Findings that still matter: active status on a case that is not closed.
    active_findings = [
        f for f in findings
        if f.status in _ACTIVE_FINDING and case_by_id.get(f.case_id) and case_by_id[f.case_id].status not in _CLOSED
    ]

    exposure_total: dict[str, Decimal] = defaultdict(Decimal)
    exposure_by_case: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    findings_by_case: dict[str, int] = defaultdict(int)
    for f in active_findings:
        findings_by_case[f.case_id] += 1
        if f.impact_amount is not None:
            cur = f.currency or case_by_id[f.case_id].currency
            amt = abs(Decimal(str(f.impact_amount)))
            exposure_total[cur] += amt
            exposure_by_case[f.case_id][cur] += amt

    metrics = OverviewMetrics(
        open_cases=len(open_cases),
        open_cases_created_in_period=sum(1 for c in open_cases if _utc(c.created_at) >= start),
        needs_review=sum(1 for c in cases if c.status == "needs_review"),
        pending_approvals=len(pending),
        open_findings=len(active_findings),
        findings_in_period=sum(1 for f in active_findings if _utc(f.created_at) >= start),
        resolved_in_period=sum(1 for c in cases if c.resolved_at and _utc(c.resolved_at) >= start),
        exposure=_money(exposure_total),
        recovered_in_period=_money(recovery_service.sum_recovered(
            (c.currency, c.recovered_amount) for c in cases
            if c.status == "resolved" and c.resolved_at and _utc(c.resolved_at) >= start
        )),
        recovered_total=_money(recovery_service.sum_recovered(
            (c.currency, c.recovered_amount) for c in cases if c.status == "resolved"
        )),
    )

    # Daily series of cases created vs resolved.
    created_by_day: dict[str, int] = defaultdict(int)
    resolved_by_day: dict[str, int] = defaultdict(int)
    for c in cases:
        created_by_day[_utc(c.created_at).date().isoformat()] += 1
        if c.resolved_at:
            resolved_by_day[_utc(c.resolved_at).date().isoformat()] += 1
    series = []
    for i in range(days - 1, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        series.append(SeriesPoint(date=d, created=created_by_day.get(d, 0), resolved=resolved_by_day.get(d, 0)))

    # Action-required queue: approvals first, then reviews, then prep work.
    attention: list[AttentionItem] = []
    for a in sorted(pending, key=lambda x: _utc(x.created_at), reverse=True):
        c = case_by_id.get(a.case_id)
        if c:
            attention.append(AttentionItem(
                kind="approval", title="Approve supplier email", case_id=c.id, case_number=c.case_number,
                supplier_name=c.supplier_name, reference=c.supplier_reference, approval_id=a.id,
            ))
    pending_case_ids = {a.case_id for a in pending}
    for c in sorted(open_cases, key=lambda x: _utc(x.updated_at), reverse=True):
        if c.status == "needs_review":
            attention.append(AttentionItem(
                kind="review", title="Review discrepancy findings", case_id=c.id, case_number=c.case_number,
                supplier_name=c.supplier_name, reference=c.supplier_reference,
            ))
        elif c.status == "ready_for_approval" and c.id not in pending_case_ids:
            attention.append(AttentionItem(
                kind="prepare", title="Prepare supplier communication", case_id=c.id, case_number=c.case_number,
                supplier_name=c.supplier_name, reference=c.supplier_reference,
            ))
        elif c.status == "draft":
            attention.append(AttentionItem(
                kind="start", title="Upload documents and start analysis", case_id=c.id,
                case_number=c.case_number, supplier_name=c.supplier_name, reference=c.supplier_reference,
            ))

    recent = sorted(cases, key=lambda x: _utc(x.updated_at), reverse=True)[:6]
    recent_cases = []
    for c in recent:
        money = _money(exposure_by_case.get(c.id, {}))
        recent_cases.append(RecentCase(
            id=c.id, case_number=c.case_number, title=c.title, supplier_name=c.supplier_name,
            status=c.status, finding_count=findings_by_case.get(c.id, 0),
            exposure=money[0] if money else None, created_at=c.created_at, updated_at=c.updated_at,
        ))

    return OverviewOut(
        workspace_name=workspace.name if workspace else "",
        period_days=days,
        metrics=metrics,
        series=series,
        attention=attention[:5],
        recent_cases=recent_cases,
    )


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
def members(
    workspace_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at)
    ).all()
    return [
        MemberOut(user_id=u.id, full_name=u.full_name, email=u.email, role=m.role, joined_at=m.created_at)
        for m, u in rows
    ]


@router.get("/workspaces/{workspace_id}/settings", response_model=WorkspaceSettingsOut)
def workspace_settings(
    workspace_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> WorkspaceSettingsOut:
    """Policies and integrations that apply to this workspace."""
    ctx.require(Permission.READ_CASE)
    return _settings_out(db, workspace_id, ctx.role)


def _settings_out(db: Session, workspace_id: str, role: str) -> WorkspaceSettingsOut:
    workspace = db.get(Workspace, workspace_id)
    policy = policy_service.get_policy(db, workspace_id)
    updated_by = db.get(User, policy.updated_by) if policy.updated_by else None
    return WorkspaceSettingsOut(
        workspace_id=workspace_id,
        workspace_name=workspace.name if workspace else "",
        your_role=role,
        price_tolerance=str(policy.price_tolerance),
        quantity_tolerance=str(policy.quantity_tolerance),
        reviewers_can_approve=policy.reviewers_can_approve,
        policy_updated_at=policy.updated_at,
        policy_updated_by_name=(updated_by.full_name or updated_by.email) if updated_by else None,
        max_upload_bytes=app_settings.max_upload_bytes,
        accepted_extensions=[".pdf", ".json", ".txt", ".png", ".jpg", ".jpeg"],
        ocr_available=ocr_service.available(),
        tts_available=tts_service.available(),
        stt_available=stt_service.available(),
        email_configured=get_email_provider().configured,
        storage_backend=(app_settings.storage_backend or "local").lower().strip(),
        email_sender=app_settings.smtp_from or None,
        llm_configured=get_llm_provider().configured,
        llm_provider=app_settings.llm_provider or None,
        **vars(policy_service.get_automation(db, workspace_id)),
        inbound_available=inbound_service.available(),
        # Only admins see the address: anyone holding it can file documents into the workspace.
        inbound_address=inbound_service.address_for(workspace) if workspace and role == "admin" else None,
    )


@router.patch("/workspaces/{workspace_id}/settings", response_model=WorkspaceSettingsOut)
def update_workspace_settings(
    workspace_id: str,
    payload: WorkspaceSettingsUpdate,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> WorkspaceSettingsOut:
    """Admins edit the workspace name and comparison/approval policy. Audited."""
    ctx.require(Permission.MANAGE_WORKSPACE)
    workspace = db.get(Workspace, workspace_id)
    current = policy_service.get_policy(db, workspace_id)
    changes: dict = {}

    if payload.workspace_name is not None:
        name = payload.workspace_name.strip()
        if not name:
            raise unprocessable("INVALID_NAME", "Workspace name can't be empty.")
        if workspace and name != workspace.name:
            changes["workspace_name"] = {"from": workspace.name, "to": name}
            workspace.name = name

    price = current.price_tolerance
    qty = current.quantity_tolerance
    if payload.price_tolerance is not None:
        price = _tolerance(payload.price_tolerance, "price_tolerance", places=4)
    if payload.quantity_tolerance is not None:
        qty = _tolerance(payload.quantity_tolerance, "quantity_tolerance", places=4)
    reviewers = current.reviewers_can_approve if payload.reviewers_can_approve is None else payload.reviewers_can_approve

    for key, before, after in (
        ("price_tolerance", current.price_tolerance, price),
        ("quantity_tolerance", current.quantity_tolerance, qty),
        ("reviewers_can_approve", current.reviewers_can_approve, reviewers),
    ):
        if before != after:
            changes[key] = {"from": str(before), "to": str(after)}

    auto_before = policy_service.get_automation(db, workspace_id)
    auto_changes: dict = {}
    for flag in (*policy_service.AUTOMATION_FLAGS, "follow_up_days"):
        value = getattr(payload, flag)
        if value is not None and value != getattr(auto_before, flag):
            auto_changes[flag] = value
            changes[flag] = {"from": str(getattr(auto_before, flag)).lower(), "to": str(value).lower()}

    if changes:
        policy_service.save_policy(
            db,
            workspace_id,
            price_tolerance=price,
            quantity_tolerance=qty,
            reviewers_can_approve=reviewers,
            updated_by=ctx.user.id,
        )
        if auto_changes:
            db.flush()
            policy_service.save_automation(db, workspace_id, auto_changes, ctx.user.id)
        audit_service.record_event(
            db,
            workspace_id=workspace_id,
            event_type="workspace.settings_updated",
            actor_type="user",
            actor_id=ctx.user.id,
            payload={"changes": changes},
            commit=False,
        )
        db.commit()
    return _settings_out(db, workspace_id, ctx.role)


def _tolerance(raw: str, field: str, places: int) -> Decimal:
    from decimal import InvalidOperation

    try:
        value = Decimal(raw.strip())
    except (InvalidOperation, AttributeError):
        raise unprocessable("INVALID_TOLERANCE", f"{field.replace('_', ' ').capitalize()} must be a number.")
    if not value.is_finite() or value < 0 or value > Decimal("1000000"):
        raise unprocessable("INVALID_TOLERANCE", f"{field.replace('_', ' ').capitalize()} must be between 0 and 1,000,000.")
    if -value.as_tuple().exponent > places:
        raise unprocessable("INVALID_TOLERANCE", f"Use at most {places} decimal places.")
    return value.normalize() if value != 0 else Decimal("0")


# ---- Notifications ----------------------------------------------------------------

_NOTIFY_EVENTS = {
    "approval.requested",
    "approval.decided",
    "action.executed",
    "action.exported",
    "action.failed",
    "investigation.completed",
    "analysis.failed",
    "document.extraction.failed",
    "finding.reviewed",
    "case.resolved",
    "case.archived",
    "case.reopened",
    "member.joined",
}


@router.get("/workspaces/{workspace_id}/notifications", response_model=NotificationsOut)
def notifications(
    workspace_id: str,
    limit: int = Query(default=20, ge=1, le=50),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> NotificationsOut:
    """Recent events by other people or the system that this member should know about."""
    from app.models.access import NotificationState
    from app.models.audit_event import AuditEvent

    ctx.require(Permission.READ_CASE)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    state = db.execute(
        select(NotificationState).where(
            NotificationState.workspace_id == workspace_id, NotificationState.user_id == ctx.user.id
        )
    ).scalar_one_or_none()
    last_seen = _utc(state.last_seen_at) if state else None

    rows = db.execute(
        select(AuditEvent)
        .where(
            AuditEvent.workspace_id == workspace_id,
            AuditEvent.event_type.in_(_NOTIFY_EVENTS),
            AuditEvent.created_at >= since,
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(200)
    ).scalars().all()
    relevant = [e for e in rows if e.actor_id != ctx.user.id]

    case_ids = {e.case_id for e in relevant if e.case_id}
    numbers = {c.id: c.case_number for c in db.execute(select(Case).where(Case.id.in_(case_ids))).scalars()} if case_ids else {}
    actor_ids = {e.actor_id for e in relevant if e.actor_id}
    names = {u.id: (u.full_name or u.email) for u in db.execute(select(User).where(User.id.in_(actor_ids))).scalars()} if actor_ids else {}

    def unread(e) -> bool:
        return last_seen is None or _utc(e.created_at) > last_seen

    items = []
    for e in relevant[:limit]:
        payload = json.loads(e.event_payload_json) if e.event_payload_json else {}
        items.append(
            NotificationOut(
                id=e.id,
                event_type=e.event_type,
                case_id=e.case_id,
                case_number=numbers.get(e.case_id) if e.case_id else None,
                actor_type=e.actor_type,
                actor_name=names.get(e.actor_id) if e.actor_id else None,
                # Only small, non-sensitive fields are forwarded.
                detail={k: payload[k] for k in ("decision", "status", "document_type", "error_code", "role") if k in payload},
                created_at=e.created_at,
                unread=unread(e),
            )
        )
    return NotificationsOut(items=items, unread_count=sum(1 for e in relevant if unread(e)))


@router.post("/workspaces/{workspace_id}/notifications/mark-read", status_code=204)
def mark_notifications_read(
    workspace_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> Response:
    from app.models.access import NotificationState

    state = db.execute(
        select(NotificationState).where(
            NotificationState.workspace_id == workspace_id, NotificationState.user_id == ctx.user.id
        )
    ).scalar_one_or_none()
    if state is None:
        state = NotificationState(workspace_id=workspace_id, user_id=ctx.user.id, last_seen_at=utcnow())
        db.add(state)
    else:
        state.last_seen_at = utcnow()
    db.commit()
    return Response(status_code=204)


@router.get("/workspaces/{workspace_id}/suppliers", response_model=list[SupplierOut])
def suppliers(
    workspace_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[SupplierOut]:
    """Suppliers derived from case records, grouped by normalized name."""
    from app.services.normalization import normalize_text

    ctx.require(Permission.READ_CASE)
    cases = db.execute(select(Case).where(Case.workspace_id == workspace_id)).scalars().all()
    findings = db.execute(select(Finding).where(Finding.workspace_id == workspace_id)).scalars().all()
    case_by_id = {c.id: c for c in cases}

    groups: dict[str, dict] = {}
    for c in cases:
        if not c.supplier_name:
            continue
        key = normalize_text(c.supplier_name)
        g = groups.setdefault(key, {"name": c.supplier_name, "cases": [], "exposure": defaultdict(Decimal), "findings": 0})
        g["cases"].append(c)

    for f in findings:
        c = case_by_id.get(f.case_id)
        if not c or not c.supplier_name or f.status not in _ACTIVE_FINDING or c.status in _CLOSED:
            continue
        g = groups[normalize_text(c.supplier_name)]
        g["findings"] += 1
        if f.impact_amount is not None:
            g["exposure"][f.currency or c.currency] += abs(Decimal(str(f.impact_amount)))

    out = []
    for g in groups.values():
        latest = max(g["cases"], key=lambda x: _utc(x.updated_at))
        out.append(SupplierOut(
            name=g["name"],
            total_cases=len(g["cases"]),
            open_cases=sum(1 for c in g["cases"] if c.status not in _CLOSED),
            resolved_cases=sum(1 for c in g["cases"] if c.status == "resolved"),
            active_findings=g["findings"],
            exposure=_money(g["exposure"]),
            last_activity_at=latest.updated_at,
            latest_case_id=latest.id,
        ))
    out.sort(key=lambda s: (s.open_cases, _utc(s.last_activity_at)), reverse=True)
    return out
