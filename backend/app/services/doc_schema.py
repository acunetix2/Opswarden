"""Canonical, versioned structured-document schema (schema_version 1.0).

Extraction output must conform to this schema. Money and quantities are kept
as strings at the boundary and parsed into Decimal inside the comparison
engine, never as floats (see SECURITY/ARCHITECTURE decimal-safe rules).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"

DocumentType = Literal["purchase_order", "invoice", "delivery_receipt"]


class LineItem(BaseModel):
    sku: str | None = None
    description: str | None = None
    quantity: str | None = None          # ordered/invoiced quantity
    received_quantity: str | None = None  # delivery receipts
    unit: str | None = None
    unit_price: str | None = None
    line_total: str | None = None


class StructuredDocument(BaseModel):
    schema_version: str = SCHEMA_VERSION
    document_type: DocumentType
    supplier_name: str | None = None
    supplier_reference: str | None = None
    # The supplier's own contact details as printed (never the buyer's).
    supplier_email: str | None = None
    supplier_phone: str | None = None
    supplier_address: str | None = None
    document_number: str | None = None
    document_date: str | None = None
    purchase_order_reference: str | None = None
    currency: str | None = None
    subtotal: str | None = None
    tax: str | None = None
    grand_total: str | None = None
    delivery_date: str | None = None
    line_items: list[LineItem] = Field(default_factory=list)
    # Where each value sits on the page, from OCR: field path -> {"page": 1, "box": [ymin, xmin, ymax, xmax]}
    # on a 0-1000 grid. Not part of the stored fields themselves (exclude=True).
    boxes: dict[str, dict] = Field(default_factory=dict, exclude=True)
