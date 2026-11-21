"""Supplier and purchase-order register.

Suppliers and purchase orders are recorded once and then picked when a case is
opened, so investigations start from the organisation's own records instead of
retyped names. A purchase order may carry its file; opening a case from it
attaches that file as the case's purchase order.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (UniqueConstraint("workspace_id", "normalized_name", name="uq_supplier_name"),)

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, ForeignKey("workspaces.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(300), nullable=False)
    supplier_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    payment_terms: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str] = mapped_column(GUID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (UniqueConstraint("workspace_id", "normalized_number", name="uq_po_number"),)

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, ForeignKey("workspaces.id"), index=True, nullable=False)
    supplier_id: Mapped[str] = mapped_column(GUID, ForeignKey("suppliers.id"), index=True, nullable=False)
    po_number: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_number: Mapped[str] = mapped_column(String(100), nullable=False)
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # open: awaiting delivery or invoice · received: goods in · closed: settled · cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    # The PO file, if uploaded. Stored privately like case documents.
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(300), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str] = mapped_column(GUID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
