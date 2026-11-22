"""Fill the register from documents OpsWarden has read.

After a document is extracted, the supplier it names and the purchase order it is
(or cites) are saved to the register if they aren't there yet, and the document's
own number is stored for search. Plain code: names and numbers are normalized and
compared, nothing is inferred.

Rules that keep a person in charge:
- Existing register entries are never overwritten. Only empty fields are filled.
- Every addition is an audit event naming the source document.
- A supplier email read from a document is marked `contact_email_source="document"`.
  The approval screen flags it so the approver checks it before approving; editing
  the supplier in the register confirms it.
"""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import new_uuid
from app.integrations.storage.provider import get_storage
from app.models.case import Case
from app.models.document import Document
from app.models.registry import PurchaseOrder, Supplier
from app.services import audit_service, policy_service
from app.services.doc_schema import StructuredDocument
from app.services.normalization import normalize_reference, normalize_text, parse_decimal

_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$")
_CURRENCY = re.compile(r"^[A-Z]{3}$")


def clean_email(value: str | None) -> str | None:
    v = (value or "").strip().strip("<>").lower()
    return v if _EMAIL.fullmatch(v) else None


def _clean(value: str | None, limit: int) -> str | None:
    v = re.sub(r"\s+", " ", (value or "")).strip()
    return v[:limit] or None


def _currency(value: str | None) -> str | None:
    v = (value or "").strip().upper()[:3]
    return v if _CURRENCY.fullmatch(v) else None


def _iso_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat((value or "").strip()[:10])
    except ValueError:
        return None


def learn_from_document(db: Session, document: Document, doc: StructuredDocument) -> dict:
    """Save what `doc` says about its supplier and purchase order. Flushes, doesn't commit.
    Returns a small summary ({"supplier": "added"|"linked"|..., "purchase_order": ...})."""
    document.document_number = _clean(doc.document_number, 100)
    db.add(document)
    if not policy_service.get_automation(db, document.workspace_id).auto_register:
        return {}

    ws = document.workspace_id
    case = db.get(Case, document.case_id)
    actor = document.uploaded_by
    summary: dict[str, str] = {}

    # Supplier: match by normalized name, else add.
    supplier = None
    name = _clean(doc.supplier_name, 300)
    if name:
        supplier = db.execute(
            select(Supplier).where(Supplier.workspace_id == ws, Supplier.normalized_name == normalize_text(name))
        ).scalar_one_or_none()
        if supplier is None:
            supplier = Supplier(
                workspace_id=ws,
                name=name,
                normalized_name=normalize_text(name),
                supplier_code=_clean(doc.supplier_reference, 100),
                contact_email=clean_email(doc.supplier_email),
                contact_email_source="document" if clean_email(doc.supplier_email) else None,
                phone=_clean(doc.supplier_phone, 50),
                address=_clean(doc.supplier_address, 1000),
                default_currency=_currency(doc.currency) or (case.currency if case else "USD"),
                notes=f"Added by OpsWarden from {document.original_filename}.",
                created_by=actor,
            )
            db.add(supplier)
            db.flush()
            summary["supplier"] = "added"
            _audit(db, document, "register.supplier_added", {"supplier_id": supplier.id, "name": supplier.name})
        else:
            filled = []
            for field, value in (
                ("contact_email", clean_email(doc.supplier_email)),
                ("phone", _clean(doc.supplier_phone, 50)),
                ("address", _clean(doc.supplier_address, 1000)),
                ("supplier_code", _clean(doc.supplier_reference, 100)),
            ):
                if value and not getattr(supplier, field):
                    setattr(supplier, field, value)
                    filled.append(field)
                    if field == "contact_email":
                        supplier.contact_email_source = "document"
            if filled:
                summary["supplier"] = "updated"
                _audit(db, document, "register.supplier_updated", {"supplier_id": supplier.id, "fields": filled})
        if case is not None and case.supplier_id is None:
            case.supplier_id = supplier.id
            case.supplier_name = case.supplier_name or supplier.name
            summary.setdefault("supplier", "linked")

    # Purchase order: the document is a PO, or cites one.
    raw_ref = doc.document_number if doc.document_type == "purchase_order" else doc.purchase_order_reference
    po_number = _clean(raw_ref, 100)
    norm = normalize_reference(po_number)
    if norm and supplier is not None:
        po = db.execute(
            select(PurchaseOrder).where(PurchaseOrder.workspace_id == ws, PurchaseOrder.normalized_number == norm)
        ).scalar_one_or_none()
        if po is None:
            is_po = doc.document_type == "purchase_order"
            total = parse_decimal(doc.grand_total) if is_po else None
            po = PurchaseOrder(
                workspace_id=ws,
                supplier_id=supplier.id,
                po_number=po_number,
                normalized_number=norm,
                order_date=_iso_date(doc.document_date) if is_po else None,
                expected_delivery_date=_iso_date(doc.delivery_date) if is_po else None,
                currency=_currency(doc.currency) or supplier.default_currency,
                total_amount=total if total is not None and total.is_finite() and total >= 0 else None,
                description=None if is_po else f"Cited on {document.original_filename}. Add the PO file when you have it.",
                status="open",
                created_by=actor,
            )
            if is_po:
                _copy_file(document, po)
            db.add(po)
            db.flush()
            summary["purchase_order"] = "added"
            _audit(db, document, "register.purchase_order_added", {"purchase_order_id": po.id, "po_number": po.po_number})
        elif doc.document_type == "purchase_order" and not po.storage_key:
            _copy_file(document, po)
            summary["purchase_order"] = "file_added"
        if case is not None and case.purchase_order_id is None and po.workspace_id == ws:
            case.purchase_order_id = po.id
            case.supplier_reference = case.supplier_reference or po.po_number
            summary.setdefault("purchase_order", "linked")

    if case is not None:
        db.add(case)
    return summary


def _copy_file(document: Document, po: PurchaseOrder) -> None:
    """The register keeps its own copy, so deleting the case document doesn't remove it."""
    storage = get_storage()
    key = f"{document.workspace_id}_{new_uuid()}"
    storage.put(key, storage.get(document.storage_key))
    po.storage_key = key
    po.original_filename = document.original_filename
    po.mime_type = document.mime_type
    po.size_bytes = document.size_bytes
    po.sha256 = document.sha256


def _audit(db: Session, document: Document, event_type: str, payload: dict) -> None:
    audit_service.record_event(
        db,
        workspace_id=document.workspace_id,
        case_id=document.case_id,
        event_type=event_type,
        actor_type="agent",
        payload={**payload, "document_id": document.id, "document_type": document.document_type},
        commit=False,
    )
