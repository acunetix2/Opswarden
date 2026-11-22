from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    # Optional when opening from a registered purchase order (a title is generated).
    title: str | None = Field(default=None, max_length=300)
    supplier_name: str | None = Field(default=None, max_length=300)
    supplier_reference: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None
    # Registered supplier / purchase order. With a PO, supplier, reference and currency
    # come from the register and the PO's file (if any) is attached to the case.
    supplier_id: str | None = Field(default=None, max_length=64)
    purchase_order_id: str | None = Field(default=None, max_length=64)


class CasePatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    supplier_name: str | None = Field(default=None, max_length=300)
    supplier_reference: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None
    supplier_id: str | None = Field(default=None, max_length=64)
    purchase_order_id: str | None = Field(default=None, max_length=64)


class CaseOut(BaseModel):
    id: str
    workspace_id: str
    case_number: str
    title: str
    supplier_name: str | None
    supplier_reference: str | None
    supplier_id: str | None = None
    purchase_order_id: str | None = None
    supplier_contact_email: str | None = None
    currency: str
    notes: str | None
    status: str
    owner_user_id: str
    owner_name: str | None = None
    finding_count: int = 0
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    resolution_outcome: str | None = None
    recovered_amount: str | None = None  # decimal string
    resolution_note: str | None = None


class AnalyzeResponse(BaseModel):
    case_id: str
    status: str
    run_id: str | None = None


class ComparisonLine(BaseModel):
    key: str
    sku: str | None
    description: str | None
    ordered: str | None
    received: str | None
    invoiced: str | None
    po_unit_price: str | None
    invoice_unit_price: str | None
    match_method: str


class ComparisonOut(BaseModel):
    case_id: str
    currency: str
    documents_present: list[str]
    lines: list[ComparisonLine]
