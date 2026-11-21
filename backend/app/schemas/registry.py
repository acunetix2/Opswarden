from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.workspace import MoneyAmount

PO_STATUSES = ("open", "received", "closed", "cancelled")


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    supplier_code: str | None = Field(default=None, max_length=100)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    default_currency: str = Field(default="USD", min_length=3, max_length=3)
    payment_terms: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=4000)
    is_active: bool = True

    @field_validator("contact_email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return None if isinstance(v, str) and not v.strip() else v


class SupplierPatch(SupplierIn):
    name: str | None = Field(default=None, min_length=1, max_length=300)  # type: ignore[assignment]
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)  # type: ignore[assignment]
    is_active: bool | None = None  # type: ignore[assignment]


class RegisteredSupplierOut(BaseModel):
    id: str
    name: str
    supplier_code: str | None
    contact_name: str | None
    contact_email: str | None
    phone: str | None
    default_currency: str
    payment_terms: str | None
    address: str | None
    notes: str | None
    is_active: bool
    open_purchase_orders: int
    total_cases: int
    open_cases: int
    active_findings: int
    exposure: list[MoneyAmount]
    last_activity_at: datetime | None
    created_at: datetime


class PurchaseOrderIn(BaseModel):
    supplier_id: str = Field(min_length=1, max_length=64)
    po_number: str = Field(min_length=1, max_length=100)
    order_date: date | None = None
    expected_delivery_date: date | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total_amount: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=4000)
    status: str = "open"

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in PO_STATUSES:
            raise ValueError("Unknown status")
        return v


class PurchaseOrderPatch(BaseModel):
    supplier_id: str | None = Field(default=None, max_length=64)
    po_number: str | None = Field(default=None, min_length=1, max_length=100)
    order_date: date | None = None
    expected_delivery_date: date | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total_amount: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in PO_STATUSES:
            raise ValueError("Unknown status")
        return v


class PurchaseOrderOut(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    po_number: str
    order_date: date | None
    expected_delivery_date: date | None
    currency: str
    total_amount: str | None
    description: str | None
    status: str
    has_file: bool
    original_filename: str | None
    size_bytes: int | None
    case_count: int
    latest_case_id: str | None
    created_at: datetime


class SearchHit(BaseModel):
    kind: str  # case | supplier | purchase_order | finding | document
    id: str
    title: str
    subtitle: str | None = None
    href: str
    badge: str | None = None


class SearchOut(BaseModel):
    query: str
    hits: list[SearchHit]
