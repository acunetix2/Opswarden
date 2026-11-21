from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, get_current_user, load_case, workspace_context
from app.api.errors import bad_request, not_found
from app.core.permissions import Permission, role_has_permission
from app.db import get_db
from app.models.case import Case
from app.models.finding import Finding, FindingEvidence
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.common import Page
from app.models.audit_event import AuditEvent
from app.schemas.finding import (
    CaseSummaryOut,
    EvidenceOut,
    FindingOut,
    FindingReviewRequest,
    MoneyAmountOut,
    WorkspaceFindingOut,
)
from app.services import investigation_service
from app.services import audit_service

router = APIRouter(tags=["findings"])


def _finding_out(db: Session, f: Finding) -> FindingOut:
    ev_rows = db.execute(
        select(FindingEvidence).where(FindingEvidence.finding_id == f.id)
    ).scalars().all()
    return FindingOut(
        id=f.id,
        rule_id=f.rule_id,
        finding_type=f.finding_type,
        severity=f.severity,
        title=f.title,
        description=f.description,
        expected_value=json.loads(f.expected_value_json) if f.expected_value_json else None,
        observed_value=json.loads(f.observed_value_json) if f.observed_value_json else None,
        impact_amount=str(f.impact_amount) if f.impact_amount is not None else None,
        currency=f.currency,
        evidence=[
            EvidenceOut(
                document_id=e.document_id,
                field_path=e.field_path,
                page_number=e.page_number,
                snippet=e.snippet,
            )
            for e in ev_rows
        ],
        status=f.status,
        requires_review=f.requires_review,
    )


@router.get("/cases/{case_id}/findings", response_model=Page[FindingOut])
def list_findings(bundle: tuple = Depends(load_case), db: Session = Depends(get_db)) -> Page[FindingOut]:
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(Finding).where(Finding.case_id == case.id).order_by(Finding.created_at)
    ).scalars().all()
    return Page[FindingOut](items=[_finding_out(db, f) for f in rows], next_cursor=None)


@router.get("/workspaces/{workspace_id}/findings", response_model=list[WorkspaceFindingOut])
def list_workspace_findings(
    workspace_id: str,
    limit: int = Query(default=500, le=1000),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[WorkspaceFindingOut]:
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(Finding, Case.case_number, Case.title, Case.supplier_name)
        .join(Case, Case.id == Finding.case_id)
        .where(Finding.workspace_id == workspace_id)
        .order_by(Finding.created_at.desc())
        .limit(limit)
    ).all()
    return [
        WorkspaceFindingOut(
            id=f.id,
            case_id=f.case_id,
            case_number=number,
            case_title=title,
            supplier_name=supplier,
            rule_id=f.rule_id,
            finding_type=f.finding_type,
            severity=f.severity,
            title=f.title,
            impact_amount=str(f.impact_amount) if f.impact_amount is not None else None,
            currency=f.currency,
            status=f.status,
            created_at=f.created_at,
        )
        for f, number, title, supplier in rows
    ]


@router.post("/findings/{finding_id}/review", response_model=FindingOut)
def review_finding(
    finding_id: str,
    payload: FindingReviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FindingOut:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise not_found("Finding")
    member = db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.workspace_id == finding.workspace_id,
        )
    ).scalar_one_or_none()
    if member is None:
        raise not_found("Finding")
    if not role_has_permission(member.role, Permission.REVIEW_FINDING):
        from app.api.errors import forbidden

        raise forbidden()

    if payload.decision == "dismiss" and not (payload.comment and payload.comment.strip()):
        raise bad_request("REASON_REQUIRED", "Dismissing a finding requires a reason.")

    # "reopen" undoes a confirm or dismiss and puts the finding back in the open queue.
    status_map = {"confirm": "confirmed", "dismiss": "dismissed", "needs_review": "needs_review", "reopen": "open"}
    finding.status = status_map[payload.decision]
    finding.review_comment = payload.comment
    db.add(finding)
    audit_service.record_event(
        db,
        workspace_id=finding.workspace_id,
        case_id=finding.case_id,
        event_type="finding.reviewed",
        actor_type="user",
        actor_id=user.id,
        payload={"finding_id": finding.id, "decision": payload.decision},
        commit=False,
    )
    db.commit()
    return _finding_out(db, finding)


_ACTIVE = {"open", "confirmed", "needs_review"}
_BILLING_TYPES = {"quantity_mismatch", "price_mismatch", "total_mismatch", "duplicate_invoice", "currency_mismatch"}


def _next_step(analyzed: bool, active: list[Finding]) -> str:
    """Policy-template recommendation. Deterministic; never decided by an LLM."""
    if not analyzed:
        return "Upload the purchase order, invoice, and delivery receipt, then run analysis."
    types = {f.finding_type for f in active}
    if types & _BILLING_TYPES:
        return (
            "Hold the invoice for review and request clarification from the supplier "
            "before it moves to payment processing."
        )
    if "missing_document" in types:
        return "Upload the missing documents to complete the three-way match."
    if active:
        return "Review the flagged items and confirm the correct values with your team."
    return "No discrepancies remain. A reviewer can confirm the outcome and close the case."


@router.get("/cases/{case_id}/summary", response_model=CaseSummaryOut)
def case_summary(bundle: tuple = Depends(load_case), db: Session = Depends(get_db)) -> CaseSummaryOut:
    from collections import defaultdict
    from decimal import Decimal

    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    findings = db.execute(select(Finding).where(Finding.case_id == case.id)).scalars().all()
    analyzed = db.execute(
        select(AuditEvent.id).where(
            AuditEvent.case_id == case.id, AuditEvent.event_type == "comparison.completed"
        )
    ).first() is not None

    active = [f for f in findings if f.status in _ACTIVE]
    by_severity: dict[str, int] = defaultdict(int)
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for f in active:
        by_severity[f.severity] += 1
        if f.impact_amount is not None:
            totals[f.currency or case.currency] += abs(Decimal(str(f.impact_amount)))

    exposure = [
        MoneyAmountOut(currency=c, amount=str(a.quantize(Decimal("0.01"))))
        for c, a in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
        if a > 0
    ]
    summary = (
        investigation_service.build_summary(case.title, case.supplier_name, findings)
        if analyzed
        else "This case has not been analyzed yet."
    )
    return CaseSummaryOut(
        case_id=case.id,
        analyzed=analyzed,
        active_findings=len(active),
        by_severity=dict(by_severity),
        exposure=exposure,
        summary=summary,
        recommended_next_step=_next_step(analyzed, active),
    )
