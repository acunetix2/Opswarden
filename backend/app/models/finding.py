from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(GUID, ForeignKey("cases.id"), index=True, nullable=False)
    finding_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    expected_value_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    observed_value_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    rule_id: Mapped[str] = mapped_column(String(64), nullable=False)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_review: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FindingEvidence(Base):
    __tablename__ = "finding_evidence"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    finding_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("findings.id"), index=True, nullable=False
    )
    document_id: Mapped[str | None] = mapped_column(GUID, nullable=True)
    field_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page_number: Mapped[int | None] = mapped_column(nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
