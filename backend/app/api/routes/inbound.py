"""Invoices by email, supplier replies and the scheduled follow-up run.

Machine endpoints (`/inbound/email`, `/automation/run`) need the AUTOMATION_SECRET
header and answer 404 without it, so they don't reveal themselves. Workspace
endpoints use the normal membership and permission checks.
"""
from __future__ import annotations

import hmac

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, workspace_context
from app.api.errors import ApiError, not_found
from app.core.config import settings
from app.core.permissions import Permission
from app.db import get_db
from app.models.workspace import Workspace
from app.services import audit_service, followup_service, inbound_service

router = APIRouter(tags=["inbound"])


class FiledOut(BaseModel):
    case_id: str
    case_number: str
    document_type: str
    filename: str
    analysis_started: bool
    message: str


class InboundOut(BaseModel):
    filed: list[FiledOut] = []
    rejected: list[dict] = []
    reply: dict | None = None
    ignored: str | None = None


class InboxOut(BaseModel):
    available: bool
    enabled: bool
    address: str | None


def _secret_ok(value: str | None) -> bool:
    return bool(settings.automation_secret) and hmac.compare_digest((value or "").encode(), settings.automation_secret.encode())


def _out(result: inbound_service.InboundResult) -> InboundOut:
    return InboundOut(
        filed=[
            FiledOut(
                case_id=f.decision.case.id, case_number=f.decision.case.case_number,
                document_type=f.document.document_type, filename=f.document.original_filename,
                analysis_started=f.analysis_started, message=f.message,
            )
            for f in result.filed
        ],
        rejected=result.rejected,
        reply=result.reply,
        ignored=result.ignored,
    )


def _queue(background: BackgroundTasks, result: inbound_service.InboundResult) -> None:
    from app.api.routes.cases import _run_analysis_job

    for case_id, run_id in result.run_jobs:
        background.add_task(_run_analysis_job, case_id, run_id)


@router.post("/inbound/email", response_model=InboundOut, status_code=202, include_in_schema=False)
async def inbound_email(
    request: Request,
    background: BackgroundTasks,
    x_opswarden_secret: str | None = Header(default=None),
    x_opswarden_to: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> InboundOut:
    """Raw RFC 822 message from the Cloudflare Email Worker."""
    if not _secret_ok(x_opswarden_secret):
        raise not_found("Resource")
    raw = await request.body()
    try:
        result = inbound_service.process_email(db, raw, recipient=x_opswarden_to)
    except inbound_service.InboundRejected as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    _queue(background, result)
    return _out(result)


@router.post("/automation/run", include_in_schema=False)
def automation_run(x_opswarden_secret: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    """Scheduled run (hourly from the Email Worker's cron): drafts reminders that are due."""
    if not _secret_ok(x_opswarden_secret):
        raise not_found("Resource")
    return followup_service.run_due(db)


@router.get("/workspaces/{workspace_id}/inbound", response_model=InboxOut)
def get_inbox(workspace_id: str, ctx: WorkspaceContext = Depends(workspace_context), db: Session = Depends(get_db)) -> InboxOut:
    ctx.require(Permission.MANAGE_WORKSPACE)
    ws = db.get(Workspace, workspace_id)
    return InboxOut(available=inbound_service.available(), enabled=bool(ws and ws.inbound_nonce), address=inbound_service.address_for(ws) if ws else None)


@router.post("/workspaces/{workspace_id}/inbound", response_model=InboxOut)
def enable_inbox(workspace_id: str, ctx: WorkspaceContext = Depends(workspace_context), db: Session = Depends(get_db)) -> InboxOut:
    """Turn on the inbox, or replace its address (the old one stops working)."""
    ctx.require(Permission.MANAGE_WORKSPACE)
    ws = db.get(Workspace, workspace_id)
    replaced = bool(ws.inbound_nonce)
    address = inbound_service.enable(db, ws, ctx.user.id)
    audit_service.record_event(
        db, workspace_id=workspace_id, event_type="inbound.address_replaced" if replaced else "inbound.enabled",
        actor_type="user", actor_id=ctx.user.id, payload={}, commit=False,
    )
    db.commit()
    return InboxOut(available=inbound_service.available(), enabled=True, address=address)


@router.delete("/workspaces/{workspace_id}/inbound", response_model=InboxOut)
def disable_inbox(workspace_id: str, ctx: WorkspaceContext = Depends(workspace_context), db: Session = Depends(get_db)) -> InboxOut:
    ctx.require(Permission.MANAGE_WORKSPACE)
    ws = db.get(Workspace, workspace_id)
    inbound_service.disable(db, ws)
    audit_service.record_event(db, workspace_id=workspace_id, event_type="inbound.disabled", actor_type="user",
                               actor_id=ctx.user.id, payload={}, commit=False)
    db.commit()
    return InboxOut(available=inbound_service.available(), enabled=False, address=None)


@router.post("/workspaces/{workspace_id}/inbound/test", response_model=InboundOut, status_code=202)
def test_inbox(
    workspace_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> InboundOut:
    """Process a saved email (.eml) exactly as if it had arrived at the inbox."""
    ctx.require(Permission.CREATE_CASE)
    ctx.require(Permission.UPLOAD_DOCUMENT)
    raw = file.file.read(inbound_service.MAX_MESSAGE_BYTES + 1)
    if not raw:
        raise ApiError(400, "EMPTY_FILE", "The uploaded file is empty.")
    try:
        result = inbound_service.process_email(db, raw, workspace=db.get(Workspace, workspace_id))
    except inbound_service.InboundRejected as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    _queue(background, result)
    return _out(result)


@router.post("/workspaces/{workspace_id}/follow-ups/run")
def run_follow_ups(workspace_id: str, ctx: WorkspaceContext = Depends(workspace_context), db: Session = Depends(get_db)) -> dict:
    """Draft any reminders that are due now in this workspace (the hourly run does this too)."""
    ctx.require(Permission.MANAGE_WORKSPACE)
    return followup_service.run_due(db, workspace_id=workspace_id)
