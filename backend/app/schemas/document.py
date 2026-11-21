from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: str
    case_id: str
    document_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    processing_status: str
    error_code: str | None = None
    created_at: datetime


class WorkspaceDocumentOut(DocumentOut):
    case_number: str | None = None
    case_title: str | None = None


class DocumentUploadResponse(BaseModel):
    document_id: str
    processing_status: str
    filename: str


class DownloadResponse(BaseModel):
    url: str
    expires_in: int


class FieldCorrection(BaseModel):
    field_path: str = Field(min_length=1, max_length=200)
    value: str
    reason: str | None = None


class CorrectionsRequest(BaseModel):
    corrections: list[FieldCorrection] = Field(min_length=1)


class ExtractedFieldOut(BaseModel):
    id: str
    document_id: str
    field_path: str
    value: str
    confidence: float | None
    source_page: int | None
    source_text: str | None
    review_status: str


class ExtractionReviewOut(BaseModel):
    document_id: str
    document_type: str
    status: str
    fields: list[ExtractedFieldOut]
