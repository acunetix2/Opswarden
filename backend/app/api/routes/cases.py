from __future__ import annotations

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fastapi import BackgroundTasks

from app.api.deps import WorkspaceContext, load_case, workspace_context
from app.api.errors import conflict, unprocessable
from app.core.logging import get_logger
from app.core.permissions import Permission
from app.db import SessionLocal, get_db, new_uuid
from app.models.approval import Approval
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.finding import Finding
from app.models.registry import PurchaseOrder, Supplier
from app.models.user import User
from app.models.workspace import Workspace
from app.models.document import Document
from app.schemas.case import (
    AnalyzeResponse,
    CaseCreate,
    CaseOut,
    CasePatch,
    ComparisonLine,
    ComparisonOut,
)
from app.services.comparison_service import match_line_items
from app.services import audit_service, case_service, recovery_service
from app.agents import orchestrator

router = APIRouter(tags=["cases"])
log = get_logger("opswarden.cases")


_ACTIVE_FINDING = ("open", "confirmed", "needs_review")


def _to_out(c: Case, db: Session | None = None) -> CaseOut:
    owner_name = None
    finding_count = 0
    contact_email = None
    if db is not None:
        owner = db.get(User, c.owner_user_id)
        owner_name = (owner.full_name or owner.email) if owner else None
        if c.supplier_id:
            sup = db.get(Supplier, c.supplier_id)
            contact_email = sup.contact_email if sup else None
        finding_count = db.execute(
            select(func.count(Finding.id)).where(
                Finding.case_id == c.id, Finding.status.in_(_ACTIVE_FINDING)
            )
        ).scalar_one()
    return CaseOut(
        owner_name=owner_name,
        finding_count=finding_count,
        id=c.id,
        workspace_id=c.workspace_id,
        case_number=c.case_number,
        title=c.title,
        supplier_name=c.supplier_name,
        supplier_reference=c.supplier_reference,
        supplier_id=c.supplier_id,
        purchase_order_id=c.purchase_order_id,
        supplier_contact_email=contact_email,
        currency=c.currency,
        notes=c.notes,
        status=c.status,
        owner_user_id=c.owner_user_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        resolved_at=c.resolved_at,
        resolution_outcome=c.resolution_outcome,
        recovered_amount=(
            str(Decimal(str(c.recovered_amount)).quantize(Decimal("0.01")))
            if c.recovered_amount is not None else None
        ),
        resolution_note=c.resolution_note,
    )


@router.post("/workspaces/{workspace_id}/cases", response_model=CaseOut, status_code=201)
def create_case(
    workspace_id: str,
    payload: CaseCreate,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> CaseOut:
    ctx.require(Permission.CREATE_CASE)
    workspace = db.get(Workspace, workspace_id)
    supplier, po = _registry_refs(db, workspace_id, payload.supplier_id, payload.purchase_order_id)

    title = (payload.title or "").strip()
    if not title:
        if po is None:
            raise unprocessable("TITLE_REQUIRED", "Give the case a short title.")
        title = f"{po.po_number} · {supplier.name}" if supplier else po.po_number
    case = Case(
        workspace_id=workspace_id,
        case_number=case_service.next_case_number(db, workspace),
        title=title[:300],
        supplier_id=supplier.id if supplier else None,
        purchase_order_id=po.id if po else None,
        supplier_name=supplier.name if supplier else payload.supplier_name,
        supplier_reference=po.po_number if po else payload.supplier_reference,
        currency=((po.currency if po else None) or payload.currency or (supplier.default_currency if supplier else None) or "USD").upper(),
        notes=payload.notes,
        status="draft",
        owner_user_id=ctx.user.id,
        created_by=ctx.user.id,
    )
    db.add(case)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        case_id=case.id,
        event_type="case.created",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={
            "case_number": case.case_number,
            "title": case.title,
            **({"from_purchase_order": po.po_number} if po else {}),
        },
        commit=False,
    )
    if po is not None:
        from app.api.routes.registry import attach_po_file_to_case

        attach_po_file_to_case(db, po, case, ctx.user.id)
    db.commit()
    return _to_out(case, db)


def _registry_refs(db: Session, workspace_id: str, supplier_id: str | None, po_id: str | None) -> tuple[Supplier | None, PurchaseOrder | None]:
    """Resolves register references, refusing anything from another workspace."""
    po = None
    if po_id:
        po = db.get(PurchaseOrder, po_id)
        if po is None or po.workspace_id != workspace_id:
            raise unprocessable("PURCHASE_ORDER_NOT_FOUND", "Choose a registered purchase order.")
        supplier_id = po.supplier_id
    supplier = None
    if supplier_id:
        supplier = db.get(Supplier, supplier_id)
        if supplier is None or supplier.workspace_id != workspace_id:
            raise unprocessable("SUPPLIER_NOT_FOUND", "Choose a registered supplier.")
    return supplier, po


@router.get("/workspaces/{workspace_id}/cases", response_model=list[CaseOut])
def list_cases(
    workspace_id: str,
    status: str | None = None,
    search: str | None = None,
    owner_id: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=50, le=200),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[CaseOut]:
    ctx.require(Permission.READ_CASE)
    stmt = select(Case).where(Case.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(Case.status == status)
    elif not include_archived:
        stmt = stmt.where(Case.status != "archived")
    if owner_id:
        stmt = stmt.where(Case.owner_user_id == owner_id)
    if search:
        like = f"%{search.lower()}%"
        from sqlalchemy import func, or_

        stmt = stmt.where(
            or_(
                func.lower(Case.title).like(like),
                func.lower(Case.supplier_name).like(like),
                func.lower(Case.case_number).like(like),
                func.lower(Case.supplier_reference).like(like),
            )
        )
    stmt = stmt.order_by(Case.updated_at.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [_to_out(c, db) for c in rows]


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(bundle: tuple = Depends(load_case), db: Session = Depends(get_db)) -> CaseOut:
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    return _to_out(case, db)


@router.patch("/cases/{case_id}", response_model=CaseOut)
def patch_case(
    payload: CasePatch,
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> CaseOut:
    case, ctx = bundle
    ctx.require(Permission.EDIT_CASE)
    data = payload.model_dump(exclude_unset=True)
    if "supplier_id" in data or "purchase_order_id" in data:
        supplier, po = _registry_refs(db, case.workspace_id, data.get("supplier_id"), data.get("purchase_order_id"))
        case.supplier_id = supplier.id if supplier else None
        case.purchase_order_id = po.id if po else None
        if supplier:
            data["supplier_name"] = supplier.name
        if po:
            data["supplier_reference"] = po.po_number
            data.setdefault("currency", po.currency)
    if "title" in data and not (data["title"] or "").strip():
        raise unprocessable("TITLE_REQUIRED", "Give the case a short title.")
    for field in ("title", "supplier_name", "supplier_reference", "notes"):
        if field in data:
            setattr(case, field, data[field])
    if "currency" in data and data["currency"]:
        case.currency = data["currency"].upper()
    db.add(case)
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="case.updated",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"fields": list(data.keys())},
        commit=False,
    )
    db.commit()
    return _to_out(case, db)


def _run_analysis_job(case_id: str, run_id: str) -> None:
    """Background job: its own session, and any failure lands the case in a recoverable state."""
    db = SessionLocal()
    try:
        case = db.get(Case, case_id)
        if case is None:
            return
        try:
            orchestrator.run_analysis(db, case, correlation_id=run_id)
            # Follow-up outside the orchestrator: close clean cases, queue letters, email approvers.
            from app.services import automation_service

            automation_service.after_analysis(db, case_id, run_id)
        except Exception:
            log.exception("Analysis failed for case %s", case_id)
            db.rollback()
            case = db.get(Case, case_id)
            if case is not None:
                case_service.set_status(db, case, "failed")
                audit_service.record_event(
                    db,
                    workspace_id=case.workspace_id,
                    case_id=case.id,
                    event_type="analysis.failed",
                    actor_type="system",
                    payload={"reason": "The analysis stopped unexpectedly. It can be re-run."},
                    correlation_id=run_id,
                    commit=False,
                )
                db.commit()
    finally:
        db.close()


@router.post("/cases/{case_id}/analyze", response_model=AnalyzeResponse, status_code=202)
def analyze_case(
    background: BackgroundTasks,
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    """Queue the bounded analysis workflow and return immediately (202).

    Idempotent while running: a second request returns the current status
    without starting another run. Progress streams from GET /cases/{id}/events.
    """
    case, ctx = bundle
    ctx.require(Permission.EDIT_CASE)
    if case.status == "processing":
        return AnalyzeResponse(case_id=case.id, status="processing", run_id=None)
    if not case_service.can_transition(case.status, "processing"):
        raise conflict("INVALID_STATE_TRANSITION", "Reopen this case before running the analysis again.")

    run_id = new_uuid()
    case_service.set_status(db, case, "processing", actor_type="user", actor_id=ctx.user.id)
    db.commit()
    background.add_task(_run_analysis_job, case.id, run_id)
    return AnalyzeResponse(case_id=case.id, status="processing", run_id=run_id)


class LifecycleRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{case_id}/archive", response_model=CaseOut)
def archive_case(
    payload: LifecycleRequest | None = None,
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> CaseOut:
    """CASE-04: archive a case. Hidden from default lists; history is kept."""
    case, ctx = bundle
    ctx.require(Permission.MANAGE_CASE_LIFECYCLE)
    if case.status == "processing":
        raise conflict("CASE_BUSY", "Wait for the analysis to finish before archiving.")
    if not case_service.can_transition(case.status, "archived") or case.status == "archived":
        raise conflict("INVALID_STATE_TRANSITION", "This case can't be archived from its current status.")
    pending = db.execute(
        select(Approval).where(Approval.case_id == case.id, Approval.status.in_(("pending", "approved")))
    ).scalars().all()
    for a in pending:
        a.status = "expired"  # an archived case must not send anything
    case_service.set_status(db, case, "archived", actor_type="user", actor_id=ctx.user.id)
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="case.archived",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"reason": payload.reason if payload else None, "expired_approvals": len(pending)},
        commit=False,
    )
    db.commit()
    return _to_out(case, db)


@router.post("/cases/{case_id}/reopen", response_model=CaseOut)
def reopen_case(
    payload: LifecycleRequest | None = None,
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> CaseOut:
    """CASE-04: reopen a resolved or archived case for review."""
    case, ctx = bundle
    ctx.require(Permission.MANAGE_CASE_LIFECYCLE)
    if case.status not in ("resolved", "archived"):
        raise conflict("INVALID_STATE_TRANSITION", "Only resolved or archived cases can be reopened.")
    analyzed = db.execute(
        select(AuditEvent.id).where(AuditEvent.case_id == case.id, AuditEvent.event_type == "comparison.completed")
    ).first() is not None
    target = "needs_review" if analyzed else "draft"
    if case.status == "resolved" and target == "draft":
        target = "needs_review"
    # A reopened case no longer counts towards recovered value.
    case.resolution_outcome = None
    case.recovered_amount = None
    case.resolution_note = None
    case_service.set_status(db, case, target, actor_type="user", actor_id=ctx.user.id)
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="case.reopened",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"reason": payload.reason if payload else None, "status": target},
        commit=False,
    )
    db.commit()
    return _to_out(case, db)


class ResolveRequest(BaseModel):
    # Older clients send only a comment; they get "no_discrepancy" recorded explicitly.
    outcome: Literal["recovered", "corrected_invoice", "no_discrepancy", "written_off"] = "no_discrepancy"
    recovered_amount: str | None = Field(default=None, max_length=32)
    comment: str | None = Field(default=None, max_length=2000)


@router.post("/cases/{case_id}/resolve", response_model=CaseOut)
def resolve_case(
    payload: ResolveRequest | None = None,
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> CaseOut:
    """A reviewer records the outcome and closes the case (controlled transition)."""
    case, ctx = bundle
    ctx.require(Permission.REVIEW_FINDING)
    if case.status == "resolved" or not case_service.can_transition(case.status, "resolved"):
        raise conflict("INVALID_STATE_TRANSITION", "This case can't be resolved from its current status.")
    payload = payload or ResolveRequest()
    try:
        amount = recovery_service.parse_recovered_amount(payload.outcome, payload.recovered_amount)
    except recovery_service.InvalidAmount as exc:
        raise unprocessable("INVALID_AMOUNT", str(exc)) from exc
    note = (payload.comment or "").strip() or None
    case.resolution_outcome = payload.outcome
    case.recovered_amount = amount
    case.resolution_note = note
    case_service.set_status(db, case, "resolved", actor_type="user", actor_id=ctx.user.id)
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="case.resolved",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={
            "comment": note,
            "outcome": payload.outcome,
            "recovered_amount": str(amount) if amount is not None else None,
            "currency": case.currency,
        },
        commit=False,
    )
    db.commit()
    return _to_out(case, db)


@router.get("/cases/{case_id}/comparison", response_model=ComparisonOut)
def get_comparison(
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> ComparisonOut:
    """Line-level ordered / received / invoiced view from extracted (or corrected) fields."""
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    docs = db.execute(
        select(Document).where(Document.case_id == case.id).order_by(Document.created_at)
    ).scalars().all()

    latest: dict[str, Document] = {}
    for d in docs:
        latest[d.document_type] = d  # newest upload per type supersedes older ones

    structured = {}
    for dtype, d in latest.items():
        if d.processing_status == "extracted":
            structured[dtype] = orchestrator._rebuild_structured(db, d)

    po = structured.get("purchase_order")
    inv = structured.get("invoice")
    dr = structured.get("delivery_receipt")
    lines = []
    for ml in match_line_items(po, inv, dr):
        ref = ml.invoice or ml.po or ml.delivery
        received = None
        if ml.delivery is not None:
            received = ml.delivery.received_quantity or ml.delivery.quantity
        lines.append(
            ComparisonLine(
                key=ml.key,
                sku=ref.sku if ref else None,
                description=ref.description if ref else None,
                ordered=ml.po.quantity if ml.po else None,
                received=received,
                invoiced=ml.invoice.quantity if ml.invoice else None,
                po_unit_price=ml.po.unit_price if ml.po else None,
                invoice_unit_price=ml.invoice.unit_price if ml.invoice else None,
                match_method=ml.match_method,
            )
        )
    return ComparisonOut(
        case_id=case.id,
        currency=case.currency,
        documents_present=sorted(structured.keys()),
        lines=lines,
    )
