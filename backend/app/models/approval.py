from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(GUID, ForeignKey("cases.id"), index=True, nullable=False)
    recommendation_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("recommendations.id"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    action_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    requested_by: Mapped[str] = mapped_column(GUID, nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(GUID, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
