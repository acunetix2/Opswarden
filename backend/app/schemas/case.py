from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    supplier_name: str | None = Field(default=None, max_length=300)
    supplier_reference: str | None = Field(default=None, max_length=100)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    notes: str | None = None


class CasePatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    supplier_name: str | None = Field(default=None, max_length=300)
    supplier_reference: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None


class CaseOut(BaseModel):
    id: str
    workspace_id: str
    case_number: str
    title: str
    supplier_name: str | None
    supplier_reference: str | None
    currency: str
    notes: str | None
    status: str
    owner_user_id: str
    owner_name: str | None = None
    finding_count: int = 0
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None


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
