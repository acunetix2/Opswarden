from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    case_number: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    supplier_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    supplier_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Registered supplier / purchase order the case was opened from (optional; names stay as typed for older cases).
    supplier_id: Mapped[str | None] = mapped_column(GUID, ForeignKey("suppliers.id"), index=True, nullable=True)
    purchase_order_id: Mapped[str | None] = mapped_column(GUID, ForeignKey("purchase_orders.id"), index=True, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    owner_user_id: Mapped[str] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Recovery tracking: set when a case is resolved, cleared when it is reopened.
    resolution_outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recovered_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
