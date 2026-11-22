"""Smart intake: drop a document, OpsWarden files it on the right case.

The document is read once (text parser, then OCR for scans), routed by
`intake_service` with deterministic rules, stored on the chosen case, and the
analysis starts in the background once the case has an invoice plus a purchase
order or delivery receipt. People still review findings and approve letters.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, workspace_context
from app.api.errors import ApiError
from app.core.config import settings
from app.core.permissions import Permission
from app.db import get_db
from app.services import intake_service

router = APIRouter(tags=["intake"])


class IntakeOut(BaseModel):
    case_id: str
    case_number: str
    created: bool
    matched_by: str
    document_id: str
    document_type: str
    reference: str | None
    supplier_name: str | None
    missing: list[str]
    analysis_started: bool
    message: str


@router.post("/workspaces/{workspace_id}/intake", response_model=IntakeOut, status_code=201)
def intake_document(
    workspace_id: str,
    background: BackgroundTasks,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> IntakeOut:
    ctx.require(Permission.CREATE_CASE)
    ctx.require(Permission.UPLOAD_DOCUMENT)
    # Read at most one byte past the limit so an oversized upload can't fill memory.
    data = file.file.read(settings.max_upload_bytes + 1)
    try:
        filed = intake_service.file_document(
            db, workspace_id, ctx.user.id,
            filename=file.filename or "upload", data=data, declared_mime=file.content_type or "",
            document_type=document_type,
        )
    except intake_service.IntakeError as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    if filed.run_id:
        from app.api.routes.cases import _run_analysis_job

        background.add_task(_run_analysis_job, filed.decision.case.id, filed.run_id)
    return _out(filed)


def _out(filed: intake_service.Filed) -> IntakeOut:
    d = filed.decision
    return IntakeOut(
        case_id=d.case.id,
        case_number=d.case.case_number,
        created=d.created,
        matched_by=d.matched_by,
        document_id=filed.document.id,
        document_type=filed.document.document_type,
        reference=d.reference,
        supplier_name=d.supplier_name,
        missing=filed.missing,
        analysis_started=filed.analysis_started,
        message=filed.message,
    )
