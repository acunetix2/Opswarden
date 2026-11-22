from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class ExtractionRun(Base):
    __tablename__ = "extraction_runs"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    document_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("documents.id"), index=True, nullable=False
    )
    schema_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1.0")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="builtin")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="deterministic")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    document_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("documents.id"), index=True, nullable=False
    )
    field_path: Mapped[str] = mapped_column(String(200), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    source_page: Mapped[int | None] = mapped_column(nullable=True)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Where the value sits on the page: [ymin, xmin, ymax, xmax], each 0-1000 (from OCR).
    bbox_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="auto")
    corrected_by: Mapped[str | None] = mapped_column(GUID, nullable=True)
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    original_value_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
