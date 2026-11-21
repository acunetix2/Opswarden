from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, load_case
from app.api.errors import bad_request, conflict, forbidden, not_found
from app.core.permissions import Permission, role_has_permission
from app.db import get_db, new_uuid, utcnow
from app.integrations.email.base import EmailMessage
from app.integrations.email.provider import get_email_provider
from app.models.approval import Approval
from app.models.case import Case
from app.models.finding import Finding
from app.models.recommendation import Recommendation
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.approval import (
    ApprovalDecisionRequest,
    ApprovalOut,
    EmailDraftOut,
    ExecuteResponse,
    RequestApprovalRequest,
    RequestApprovalResponse,
)
from app.services import approval_service, audit_service, case_service, investigation_service, policy_service

router = APIRouter(tags=["approvals"])


def _member_or_404(db: Session, user: User, workspace_id: str) -> WorkspaceMember:
    m = db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user.id, WorkspaceMember.workspace_id == workspace_id
        )
    ).scalar_one_or_none()
    if m is None:
        raise not_found("Resource")
    return m


def _load_approval(db: Session, user: User, approval_id: str) -> tuple[Approval, WorkspaceMember]:
    approval = db.get(Approval, approval_id)
    if approval is None:
        raise not_found("Approval")
    member = _member_or_404(db, user, approval.workspace_id)
    return approval, member


@router.post("/cases/{case_id}/recommendations/email-draft", response_model=EmailDraftOut)
def create_email_draft(
    bundle: tuple = Depends(load_case), db: Session = Depends(get_db)
) -> EmailDraftOut:
    case, ctx = bundle
    ctx.require(Permission.GENERATE_RECOMMENDATION)

    findings = db.execute(select(Finding).where(Finding.case_id == case.id)).scalars().all()
    draft = investigation_service.draft_supplier_email(
        case.case_number, case.supplier_name, case.supplier_reference, findings, case.currency
    )
    rationale = investigation_service.build_summary(case.title, case.supplier_name, findings)

    # The address comes from the supplier register (entered by a person), never guessed.
    recipient = None
    if case.supplier_id:
        from app.models.registry import Supplier

        supplier = db.get(Supplier, case.supplier_id)
        if supplier and supplier.workspace_id == case.workspace_id:
            recipient = supplier.contact_email

    payload = {"subject": draft.subject, "body": draft.body, "recipient": recipient, "case_id": case.id}
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
        # Provider metadata only; never the prompt or model output.
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
    db.commit()
    return EmailDraftOut(
        recommendation_id=rec.id,
        type=rec.recommendation_type,
        status="draft",
        subject=draft.subject,
        body=draft.body,
        recipient=recipient,
        requires_human_review=True,
        ai_assisted=draft.ai_assisted,
        model=draft.model if draft.ai_assisted else None,
        fallback_reason=draft.fallback_reason,
    )


@router.post("/recommendations/{recommendation_id}/request-approval", response_model=RequestApprovalResponse)
def request_approval(
    recommendation_id: str,
    payload: RequestApprovalRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RequestApprovalResponse:
    payload = payload or RequestApprovalRequest()
    recipient, subject, body = payload.recipient, payload.subject, payload.body
    rec = db.get(Recommendation, recommendation_id)
    if rec is None:
        raise not_found("Recommendation")
    member = _member_or_404(db, user, rec.workspace_id)
    if not role_has_permission(member.role, Permission.REQUEST_APPROVAL):
        raise forbidden()

    stored = json.loads(rec.payload_json)
    # Allow the user to finalize editable fields (recipient must be user-verified).
    if subject is not None:
        stored["subject"] = subject
    if body is not None:
        stored["body"] = body
    if recipient is not None:
        stored["recipient"] = recipient
    rec.payload_json = json.dumps(stored)
    db.add(rec)

    phash = approval_service.payload_hash(stored)
    approval = Approval(
        workspace_id=rec.workspace_id,
        case_id=rec.case_id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        action_payload_json=json.dumps(stored),
        payload_hash=phash,
        status="pending",
        requested_by=user.id,
        idempotency_key=new_uuid(),
    )
    db.add(approval)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=rec.workspace_id,
        case_id=rec.case_id,
        event_type="approval.requested",
        actor_type="user",
        actor_id=user.id,
        payload={"approval_id": approval.id, "payload_hash": phash},
        commit=False,
    )
    case = db.get(Case, rec.case_id)
    if case:
        case_service.set_status(db, case, "ready_for_approval", actor_type="user", actor_id=user.id)
    db.commit()
    return RequestApprovalResponse(approval_id=approval.id, status="pending", payload_hash=phash)


def _user_name(db: Session, user_id: str | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return (u.full_name or u.email) if u else None


def _approval_out(approval: Approval, db: Session) -> ApprovalOut:
    payload = json.loads(approval.action_payload_json)
    case = db.get(Case, approval.case_id)
    rec = db.get(Recommendation, approval.recommendation_id)
    return ApprovalOut(
        id=approval.id,
        case_id=approval.case_id,
        case_number=case.case_number if case else None,
        case_title=case.title if case else None,
        supplier_name=case.supplier_name if case else None,
        rationale=rec.rationale if rec else None,
        comment=approval.comment,
        requested_by_name=_user_name(db, approval.requested_by),
        reviewed_by_name=_user_name(db, approval.reviewed_by),
        action_type=approval.action_type,
        status=approval.status,
        subject=payload.get("subject"),
        body=payload.get("body"),
        recipient=payload.get("recipient"),
        requested_by=approval.requested_by,
        reviewed_by=approval.reviewed_by,
        reviewed_at=approval.reviewed_at,
        executed_at=approval.executed_at,
        provider_reference=approval.provider_reference,
        created_at=approval.created_at,
    )


@router.get("/workspaces/{workspace_id}/approvals", response_model=list[ApprovalOut])
def list_approvals(
    workspace_id: str,
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ApprovalOut]:
    _member_or_404(db, user, workspace_id)
    stmt = select(Approval).where(Approval.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(Approval.status == status)
    stmt = stmt.order_by(Approval.created_at.desc())
    return [_approval_out(a, db) for a in db.execute(stmt).scalars().all()]


@router.get("/approvals/{approval_id}", response_model=ApprovalOut)
def get_approval(
    approval_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ApprovalOut:
    approval, _ = _load_approval(db, user, approval_id)
    return _approval_out(approval, db)


@router.post("/approvals/{approval_id}/decision", response_model=ApprovalOut)
def decide_approval(
    approval_id: str,
    payload: ApprovalDecisionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApprovalOut:
    approval, member = _load_approval(db, user, approval_id)
    if not role_has_permission(member.role, Permission.DECIDE_APPROVAL):
        raise forbidden()
    if not policy_service.may_decide_external_action(db, approval.workspace_id, member.role):
        raise forbidden("Workspace policy requires an admin to approve external actions.")
    if approval.status != "pending":
        raise conflict("INVALID_APPROVAL_STATE", "This approval is not pending.")

    approval.status = "approved" if payload.decision == "approve" else "rejected"
    approval.reviewed_by = user.id
    approval.reviewed_at = utcnow()
    approval.comment = payload.comment
    db.add(approval)
    audit_service.record_event(
        db,
        workspace_id=approval.workspace_id,
        case_id=approval.case_id,
        event_type="approval.decided",
        actor_type="user",
        actor_id=user.id,
        payload={"approval_id": approval.id, "decision": payload.decision},
        commit=False,
    )
    db.commit()
    return _approval_out(approval, db)


@router.post("/approvals/{approval_id}/execute", response_model=ExecuteResponse)
def execute_approval(
    approval_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExecuteResponse:
    approval, member = _load_approval(db, user, approval_id)

    # Re-check permission and policy at execution time.
    if not role_has_permission(member.role, Permission.EXECUTE_ACTION):
        raise forbidden()
    if not policy_service.may_decide_external_action(db, approval.workspace_id, member.role):
        raise forbidden("Workspace policy requires an admin to run external actions.")

    # Idempotency: a completed execution returns the same result.
    if approval.status == "executed":
        return ExecuteResponse(
            approval_id=approval.id, status="executed", provider_reference=approval.provider_reference
        )
    if approval.status == "rejected":
        raise conflict("APPROVAL_REJECTED", "A rejected approval cannot be executed.")
    if approval.status != "approved":
        raise conflict("APPROVAL_NOT_APPROVED", "This action has not been approved.")

    stored = json.loads(approval.action_payload_json)
    # Re-verify payload hash (tamper / post-approval edit protection).
    if not approval_service.payload_matches(stored, approval.payload_hash):
        approval.status = "expired"
        db.add(approval)
        db.commit()
        raise conflict("PAYLOAD_CHANGED", "The action payload changed after approval; request a new approval.")

    provider = get_email_provider()
    if not provider.configured:
        # Do not pretend to send. Offer an export/copy fallback.
        audit_service.record_event(
            db,
            workspace_id=approval.workspace_id,
            case_id=approval.case_id,
            event_type="action.exported",
            actor_type="user",
            actor_id=user.id,
            payload={"approval_id": approval.id, "mode": "export_fallback"},
            commit=False,
        )
        db.commit()
        return ExecuteResponse(
            approval_id=approval.id,
            status="approved",
            provider_reference=None,
            export={
                "subject": stored.get("subject"),
                "body": stored.get("body"),
                "recipient": stored.get("recipient"),
                "note": "Email sending is not configured. Copy or export this draft to send manually.",
            },
        )

    recipient = stored.get("recipient")
    if not recipient:
        raise bad_request("RECIPIENT_REQUIRED", "A verified recipient is required before sending.")
    try:
        result = provider.send(
            EmailMessage(recipient=recipient, subject=stored["subject"], body=stored["body"]),
            idempotency_key=approval.idempotency_key,
        )
    except Exception:
        approval.status = "failed"
        db.add(approval)
        audit_service.record_event(
            db,
            workspace_id=approval.workspace_id,
            case_id=approval.case_id,
            event_type="action.failed",
            actor_type="integration",
            payload={"approval_id": approval.id},
            commit=False,
        )
        db.commit()
        raise conflict("EXECUTION_FAILED", "The action could not be completed. It can be retried after review.")

    approval.status = "executed"
    approval.executed_at = utcnow()
    approval.provider_reference = result.provider_reference
    db.add(approval)
    audit_service.record_event(
        db,
        workspace_id=approval.workspace_id,
        case_id=approval.case_id,
        event_type="action.executed",
        actor_type="integration",
        actor_id=user.id,
        payload={"approval_id": approval.id, "provider_reference": result.provider_reference},
        commit=False,
    )
    case = db.get(Case, approval.case_id)
    if case:
        case_service.set_status(db, case, "resolved")
    db.commit()
    return ExecuteResponse(
        approval_id=approval.id, status="executed", provider_reference=result.provider_reference
    )
