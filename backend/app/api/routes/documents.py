from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, load_case, load_document, workspace_context
from app.api.errors import bad_request, not_found, unprocessable
from app.core.config import settings
from app.core.permissions import Permission
from app.db import get_db, new_uuid, utcnow
from app.integrations.storage.provider import get_storage
from app.models.case import Case
from app.models.document import Document
from app.models.extraction import ExtractedField
from app.schemas.document import (
    CorrectionsRequest,
    DocumentOut,
    DocumentUploadResponse,
    ExtractedFieldOut,
    ExtractionReviewOut,
    WorkspaceDocumentOut,
)
from app.services import audit_service

router = APIRouter(tags=["documents"])

_ALLOWED_TYPES = {"purchase_order", "invoice", "delivery_receipt"}

# (mime, magic-signature-prefixes) accepted for the MVP.
_SIGNATURES = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "text/plain": [],  # text fixtures: no signature requirement
    "application/json": [],
}


def _detect_and_validate(filename: str, declared_mime: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        mime = "application/pdf"
    elif name.endswith(".png"):
        mime = "image/png"
    elif name.endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    elif name.endswith(".json"):
        mime = "application/json"
    elif name.endswith(".txt"):
        mime = "text/plain"
    else:
        mime = declared_mime

    if mime not in _SIGNATURES:
        raise ApiUnsupported()

    sigs = _SIGNATURES[mime]
    if sigs and not any(data.startswith(s) for s in sigs):
        raise ApiUnsupported()
    return mime


class ApiUnsupported(Exception):
    pass


@router.post("/cases/{case_id}/documents", response_model=DocumentUploadResponse, status_code=202)
async def upload_document(
    document_type: str = Form(...),
    file: UploadFile = File(...),
    bundle: tuple = Depends(load_case),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    case, ctx = bundle
    ctx.require(Permission.UPLOAD_DOCUMENT)

    if document_type not in _ALLOWED_TYPES:
        raise unprocessable("INVALID_DOCUMENT_TYPE", "Unsupported document type.")

    data = await file.read()
    if len(data) == 0:
        raise bad_request("EMPTY_FILE", "The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        from app.api.errors import ApiError

        raise ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the size limit.")

    try:
        mime = _detect_and_validate(file.filename or "upload", file.content_type or "", data)
    except ApiUnsupported:
        from app.api.errors import ApiError

        raise ApiError(415, "UNSUPPORTED_FILE_TYPE", "This file type is not supported.")

    sha = hashlib.sha256(data).hexdigest()
    storage_key = f"{case.workspace_id}_{new_uuid()}"
    get_storage().put(storage_key, data)

    doc = Document(
        workspace_id=case.workspace_id,
        case_id=case.id,
        document_type=document_type,
        storage_key=storage_key,
        original_filename=file.filename or "upload",
        mime_type=mime,
        size_bytes=len(data),
        sha256=sha,
        processing_status="queued",
        uploaded_by=ctx.user.id,
    )
    db.add(doc)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="document.uploaded",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"document_id": doc.id, "document_type": document_type, "filename": doc.original_filename},
        commit=False,
    )
    db.commit()
    return DocumentUploadResponse(
        document_id=doc.id, processing_status=doc.processing_status, filename=doc.original_filename
    )


@router.get("/cases/{case_id}/documents", response_model=list[DocumentOut])
def list_documents(
    bundle: tuple = Depends(load_case), db: Session = Depends(get_db)
) -> list[DocumentOut]:
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(Document).where(Document.case_id == case.id).order_by(Document.created_at)
    ).scalars().all()
    return [
        DocumentOut(
            id=d.id,
            case_id=d.case_id,
            document_type=d.document_type,
            original_filename=d.original_filename,
            mime_type=d.mime_type,
            size_bytes=d.size_bytes,
            processing_status=d.processing_status,
            error_code=d.error_code,
            created_at=d.created_at,
        )
        for d in rows
    ]


@router.get("/workspaces/{workspace_id}/documents", response_model=list[WorkspaceDocumentOut])
def list_workspace_documents(
    workspace_id: str,
    limit: int = Query(default=100, le=500),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[WorkspaceDocumentOut]:
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(Document, Case.case_number, Case.title)
        .join(Case, Case.id == Document.case_id)
        .where(Document.workspace_id == workspace_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
    ).all()
    return [
        WorkspaceDocumentOut(
            id=d.id,
            case_id=d.case_id,
            document_type=d.document_type,
            original_filename=d.original_filename,
            mime_type=d.mime_type,
            size_bytes=d.size_bytes,
            processing_status=d.processing_status,
            error_code=d.error_code,
            created_at=d.created_at,
            case_number=number,
            case_title=title,
        )
        for d, number, title in rows
    ]


@router.get("/documents/{document_id}", response_model=WorkspaceDocumentOut)
def get_document(
    bundle: tuple = Depends(load_document), db: Session = Depends(get_db)
) -> WorkspaceDocumentOut:
    doc, ctx = bundle
    ctx.require(Permission.READ_CASE)
    case = db.get(Case, doc.case_id)
    return WorkspaceDocumentOut(
        id=doc.id,
        case_id=doc.case_id,
        document_type=doc.document_type,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        processing_status=doc.processing_status,
        error_code=doc.error_code,
        created_at=doc.created_at,
        case_number=case.case_number if case else None,
        case_title=case.title if case else None,
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    bundle: tuple = Depends(load_document), db: Session = Depends(get_db)
) -> Response:
    """Remove a document before the case is analyzed (DOC-06). Audited."""
    from app.api.errors import conflict
    from app.models.extraction import ExtractionRun

    doc, ctx = bundle
    ctx.require(Permission.UPLOAD_DOCUMENT)
    case = db.get(Case, doc.case_id)
    if case is None or case.status != "draft":
        raise conflict(
            "CASE_NOT_EDITABLE",
            "Documents can only be removed before analysis. Upload a replacement instead.",
        )
    for f in db.execute(select(ExtractedField).where(ExtractedField.document_id == doc.id)).scalars():
        db.delete(f)
    for r in db.execute(select(ExtractionRun).where(ExtractionRun.document_id == doc.id)).scalars():
        db.delete(r)
    get_storage().delete(doc.storage_key)
    audit_service.record_event(
        db,
        workspace_id=doc.workspace_id,
        case_id=doc.case_id,
        event_type="document.deleted",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"document_type": doc.document_type, "filename": doc.original_filename},
        commit=False,
    )
    db.delete(doc)
    db.commit()
    return Response(status_code=204)


@router.get("/documents/{document_id}/download")
def download_document(
    bundle: tuple = Depends(load_document), db: Session = Depends(get_db)
) -> Response:
    doc, ctx = bundle
    ctx.require(Permission.READ_CASE)
    data = get_storage().get(doc.storage_key)
    return Response(
        content=data,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'inline; filename="{doc.original_filename}"'},
    )


@router.get("/documents/{document_id}/extracted-fields", response_model=ExtractionReviewOut)
def get_extracted_fields(
    bundle: tuple = Depends(load_document), db: Session = Depends(get_db)
) -> ExtractionReviewOut:
    doc, ctx = bundle
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(ExtractedField).where(ExtractedField.document_id == doc.id)
    ).scalars().all()
    fields = []
    for r in rows:
        try:
            value = json.loads(r.value_json)
        except json.JSONDecodeError:
            value = r.value_json
        fields.append(
            ExtractedFieldOut(
                id=r.id,
                document_id=r.document_id,
                field_path=r.field_path,
                value=str(value) if value is not None else "",
                confidence=float(r.confidence) if r.confidence is not None else None,
                source_page=r.source_page,
                source_text=r.source_text,
                review_status=r.review_status,
            )
        )
    return ExtractionReviewOut(
        document_id=doc.id, document_type=doc.document_type, status=doc.processing_status, fields=fields
    )


@router.patch("/documents/{document_id}/extracted-fields", response_model=ExtractionReviewOut)
def correct_fields(
    payload: CorrectionsRequest,
    bundle: tuple = Depends(load_document),
    db: Session = Depends(get_db),
) -> ExtractionReviewOut:
    doc, ctx = bundle
    ctx.require(Permission.CORRECT_FIELDS)

    for corr in payload.corrections:
        field = db.execute(
            select(ExtractedField).where(
                ExtractedField.document_id == doc.id,
                ExtractedField.field_path == corr.field_path,
            )
        ).scalar_one_or_none()
        if field is None:
            # Create a corrected field if it did not exist (user adds a value).
            field = ExtractedField(
                workspace_id=doc.workspace_id,
                document_id=doc.id,
                field_path=corr.field_path,
                value_json=json.dumps(corr.value),
                review_status="corrected",
            )
            db.add(field)
        else:
            try:
                current = json.loads(field.value_json)
            except json.JSONDecodeError:
                current = field.value_json
            unchanged = str(current) == corr.value
            if not unchanged and field.original_value_json is None:
                field.original_value_json = field.value_json
            if not unchanged:
                field.value_json = json.dumps(corr.value)
            # Same value = a person confirmed the extraction; otherwise it's a correction.
            field.review_status = "verified" if unchanged and field.review_status != "corrected" else "corrected"
            field.corrected_by = ctx.user.id
            field.corrected_at = utcnow()
            db.add(field)
        verified = field.review_status == "verified"
        audit_service.record_event(
            db,
            workspace_id=doc.workspace_id,
            case_id=doc.case_id,
            event_type="field.verified" if verified else "field.corrected",
            actor_type="user",
            actor_id=ctx.user.id,
            payload={"document_id": doc.id, "field_path": corr.field_path, "reason": corr.reason},
            commit=False,
        )
    db.commit()
    return get_extracted_fields(bundle=bundle, db=db)
