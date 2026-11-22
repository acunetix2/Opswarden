"""Smart intake: decide which case a dropped document belongs to.

Routing is ordinary, deterministic code. Order:
  1. an open case for the same purchase-order reference that lacks this document type,
  2. a registered purchase order (a new case is opened from it, with its file),
  3. a registered supplier matched by name,
  4. the supplier and reference printed on the document.
Nothing here crosses workspaces, and closed or busy cases are never touched.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.document import Document
from app.models.registry import PurchaseOrder, Supplier
from app.models.workspace import Workspace
from app.services import audit_service, case_service
from app.services.doc_schema import StructuredDocument
from app.services.normalization import normalize_reference, normalize_text

MatchedBy = Literal["open_case", "purchase_order", "supplier", "document"]

DOCUMENT_TYPES = ("purchase_order", "delivery_receipt", "invoice")
# Statuses a document may be filed into. Resolved, archived and processing cases are left alone.
OPEN_FOR_INTAKE = ("draft", "needs_review", "ready_for_approval", "failed")
_MAX_CANDIDATES = 500


@dataclass
class IntakeDecision:
    case: Case
    created: bool
    matched_by: MatchedBy
    reference: str | None
    supplier_name: str | None


def raw_reference_of(doc: StructuredDocument) -> str | None:
    """The purchase-order reference as printed: a PO's own number, otherwise the PO it cites."""
    raw = doc.document_number if doc.document_type == "purchase_order" else doc.purchase_order_reference
    raw = (raw or "").strip()
    return raw or None


def reference_of(doc: StructuredDocument) -> str:
    """Normalized purchase-order reference ("" when the document doesn't give one)."""
    return normalize_reference(raw_reference_of(doc))


def find_open_case(db: Session, workspace_id: str, reference: str, document_type: str) -> Case | None:
    """Most recently updated open case for `reference` that has no document of this type yet."""
    if not reference:
        return None
    rows = db.execute(
        select(Case, PurchaseOrder.normalized_number)
        .outerjoin(PurchaseOrder, PurchaseOrder.id == Case.purchase_order_id)
        .where(Case.workspace_id == workspace_id, Case.status.in_(OPEN_FOR_INTAKE))
        .order_by(Case.updated_at.desc())
        .limit(_MAX_CANDIDATES)
    ).all()
    for case, po_number in rows:
        if reference not in (normalize_reference(case.supplier_reference), po_number or ""):
            continue
        has_type = db.execute(
            select(Document.id).where(Document.case_id == case.id, Document.document_type == document_type).limit(1)
        ).first()
        if has_type is None:
            return case
    return None


def find_registered_po(db: Session, workspace_id: str, reference: str) -> PurchaseOrder | None:
    if not reference:
        return None
    return db.execute(
        select(PurchaseOrder)
        .where(PurchaseOrder.workspace_id == workspace_id, PurchaseOrder.normalized_number == reference)
        .order_by(PurchaseOrder.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def find_supplier(db: Session, workspace_id: str, name: str | None) -> Supplier | None:
    norm = normalize_text(name)
    if not norm:
        return None
    return db.execute(
        select(Supplier).where(
            Supplier.workspace_id == workspace_id, Supplier.normalized_name == norm, Supplier.is_active.is_(True)
        ).limit(1)
    ).scalar_one_or_none()


def missing_types(db: Session, case: Case) -> list[str]:
    present = set(db.execute(select(Document.document_type).where(Document.case_id == case.id)).scalars().all())
    return [t for t in DOCUMENT_TYPES if t not in present]


def ready_for_analysis(db: Session, case: Case) -> bool:
    """An invoice plus a purchase order or a delivery receipt, and a status that allows a run."""
    missing = set(missing_types(db, case))
    has_invoice = "invoice" not in missing
    has_counterpart = "purchase_order" not in missing or "delivery_receipt" not in missing
    return has_invoice and has_counterpart and case_service.can_transition(case.status, "processing")


def _title(reference: str | None, supplier: str | None, doc: StructuredDocument) -> str:
    parts = [p for p in (reference, supplier) if p]
    if parts:
        return " · ".join(parts)
    label = doc.document_type.replace("_", " ")
    return f"{label.capitalize()} {doc.document_number}" if doc.document_number else f"Unfiled {label}"


def _new_case(
    db: Session,
    workspace_id: str,
    actor_id: str,
    doc: StructuredDocument,
    *,
    supplier: Supplier | None,
    po: PurchaseOrder | None,
) -> Case:
    workspace = db.get(Workspace, workspace_id)
    reference = po.po_number if po else raw_reference_of(doc)
    supplier_name = supplier.name if supplier else (doc.supplier_name or "").strip() or None
    currency = (
        (po.currency if po else None)
        or (doc.currency or "").strip()[:3]
        or (supplier.default_currency if supplier else None)
        or "USD"
    ).upper()
    case = Case(
        workspace_id=workspace_id,
        case_number=case_service.next_case_number(db, workspace),
        title=_title(reference, supplier_name, doc)[:300],
        supplier_id=supplier.id if supplier else None,
        purchase_order_id=po.id if po else None,
        supplier_name=supplier_name[:300] if supplier_name else None,
        supplier_reference=reference[:100] if reference else None,
        currency=currency,
        status="draft",
        owner_user_id=actor_id,
        created_by=actor_id,
    )
    db.add(case)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        case_id=case.id,
        event_type="case.created",
        actor_type="user",
        actor_id=actor_id,
        payload={
            "case_number": case.case_number,
            "title": case.title,
            "via": "intake",
            **({"from_purchase_order": po.po_number} if po else {}),
        },
        commit=False,
    )
    return case


_TYPE_LABELS = {"purchase_order": "purchase order", "delivery_receipt": "delivery receipt", "invoice": "invoice"}
_MATCH_TEXT = {
    "open_case": "Added to an open case for the same purchase order",
    "purchase_order": "Matched to a registered purchase order and opened a case",
    "supplier": "Matched to a registered supplier and opened a case",
    "document": "No registered match, so a case was opened from the document's details",
}


class IntakeError(Exception):
    """A file that can't be filed. `status` and `code` map onto the API error."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass
class Filed:
    decision: IntakeDecision
    document: Document
    missing: list[str]
    analysis_started: bool
    run_id: str | None
    message: str


def _message(matched_by: str, case_number: str, missing: list[str], started: bool) -> str:
    text = f"{_MATCH_TEXT[matched_by]} ({case_number})."
    if started:
        return f"{text} The analysis has started."
    if missing:
        names = " and ".join(_TYPE_LABELS[m] for m in missing)
        return f"{text} Add the {names} to run the analysis."
    return f"{text} Run the analysis from the case page when you're ready."


def file_document(
    db: Session,
    workspace_id: str,
    actor_id: str,
    *,
    filename: str,
    data: bytes,
    declared_mime: str,
    document_type: str,
    via: str = "intake",
) -> Filed:
    """Validate, read, route and store one document. Commits. The caller queues the
    analysis job for `run_id` when it is set. Raises IntakeError and creates nothing
    for a file that can't be used."""
    import hashlib

    from app.agents import orchestrator
    from app.core.config import settings
    from app.db import new_uuid
    from app.integrations.storage.provider import get_storage
    from app.services import upload_rules
    from app.services.extraction_service import ExtractionError, extract_document

    if document_type not in upload_rules.ALLOWED_TYPES:
        raise IntakeError(422, "INVALID_DOCUMENT_TYPE", "Unsupported document type.")
    if len(data) == 0:
        raise IntakeError(400, "EMPTY_FILE", "The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise IntakeError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the size limit.")
    filename = (filename or "upload")[:300]
    try:
        mime = upload_rules.detect_mime(filename, declared_mime, data)
    except upload_rules.UnsupportedFile:
        raise IntakeError(415, "UNSUPPORTED_FILE_TYPE", "This file type is not supported.") from None

    # Read the document before anything is created: an unreadable file leaves no trace.
    try:
        structured, confidence, provider, model = extract_document(data, mime, filename, document_type)
    except ExtractionError as exc:
        raise IntakeError(
            422, "UNREADABLE_DOCUMENT",
            "OpsWarden couldn't read this document. Try a clearer scan, a digital PDF or a JSON export.",
        ) from exc
    if not structured.line_items and not any(
        (structured.document_number, structured.supplier_name, structured.purchase_order_reference, structured.grand_total)
    ):
        # Nothing to route on and nothing to compare: don't open an empty case.
        raise IntakeError(
            422, "UNREADABLE_DOCUMENT",
            "OpsWarden couldn't find any order, invoice or delivery details in this document.",
        )

    decision = route_document(db, workspace_id, actor_id, structured)
    case = decision.case
    storage_key = f"{workspace_id}_{new_uuid()}"
    get_storage().put(storage_key, data)
    doc = Document(
        workspace_id=workspace_id,
        case_id=case.id,
        document_type=document_type,
        storage_key=storage_key,
        original_filename=filename,
        mime_type=mime,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        processing_status="queued",
        uploaded_by=actor_id,
    )
    db.add(doc)
    db.flush()
    correlation_id = new_uuid()
    actor_type = "integration" if via == "email" else "user"
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        case_id=case.id,
        event_type="document.uploaded",
        actor_type=actor_type,
        actor_id=actor_id if actor_type == "user" else None,
        payload={"document_id": doc.id, "document_type": document_type, "filename": filename, "via": via},
        commit=False,
    )
    orchestrator.record_extraction(db, doc, structured, confidence, provider, model, correlation_id)
    db.flush()

    missing = missing_types(db, case)
    start = ready_for_analysis(db, case)
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        case_id=case.id,
        event_type="intake.routed",
        actor_type="system",
        payload={
            "document_id": doc.id,
            "document_type": document_type,
            "matched_by": decision.matched_by,
            "reference": decision.reference,
            "created_case": decision.created,
            "analysis_started": start,
            "via": via,
        },
        correlation_id=correlation_id,
        commit=False,
    )
    run_id = None
    if start:
        run_id = new_uuid()
        case_service.set_status(db, case, "processing", actor_type=actor_type, actor_id=actor_id if actor_type == "user" else None)
    db.commit()
    return Filed(decision, doc, missing, start, run_id, _message(decision.matched_by, case.case_number, missing, start))


def route_document(db: Session, workspace_id: str, actor_id: str, doc: StructuredDocument) -> IntakeDecision:
    """Pick (or open) the case for `doc`. Flushes but doesn't commit."""
    reference = reference_of(doc)

    existing = find_open_case(db, workspace_id, reference, doc.document_type)
    if existing is not None:
        return IntakeDecision(existing, False, "open_case", existing.supplier_reference, existing.supplier_name)

    po = find_registered_po(db, workspace_id, reference)
    if po is not None:
        supplier = db.get(Supplier, po.supplier_id)
        if supplier is not None and supplier.workspace_id != workspace_id:
            supplier = None  # never borrow another workspace's record
        case = _new_case(db, workspace_id, actor_id, doc, supplier=supplier, po=po)
        # A dropped purchase order is the PO itself; don't add the registered copy as a second one.
        if doc.document_type != "purchase_order":
            from app.api.routes.registry import attach_po_file_to_case

            attach_po_file_to_case(db, po, case, actor_id)
        return IntakeDecision(case, True, "purchase_order", case.supplier_reference, case.supplier_name)

    supplier = find_supplier(db, workspace_id, doc.supplier_name)
    if supplier is not None:
        case = _new_case(db, workspace_id, actor_id, doc, supplier=supplier, po=None)
        return IntakeDecision(case, True, "supplier", case.supplier_reference, case.supplier_name)

    case = _new_case(db, workspace_id, actor_id, doc, supplier=None, po=None)
    return IntakeDecision(case, True, "document", case.supplier_reference, case.supplier_name)
