"""Bounded analysis orchestrator.

Explicit, deterministic state machine that runs:
  documents -> extraction -> comparison -> findings/evidence -> status update.

The orchestrator holds hard bounds (max documents, no retries beyond limit) and
emits audit events at each stage. The LLM is not invoked here; it only assists
later in recommendation drafting, grounded in the findings produced here.
"""
from __future__ import annotations

import json
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.db import new_uuid, utcnow
from app.models.case import Case
from app.models.document import Document
from app.models.extraction import ExtractedField, ExtractionRun
from app.models.finding import Finding as FindingModel
from app.models.finding import FindingEvidence
from app.services import audit_service, case_service, register_service
from app.services.comparison_service import (
    ComparisonConfig,
    DocumentRef,
    PricePoint,
    run_comparison,
)
from app.services.normalization import parse_decimal
from app.services.doc_schema import StructuredDocument
from app.services.extraction_service import ExtractionError, extract_document
from app.integrations.storage.provider import get_storage

log = get_logger("opswarden.orchestrator")

MAX_DOCUMENTS = 12
MATCHED_TYPES = ("purchase_order", "invoice", "delivery_receipt")


def _rebuild_structured(db: Session, document: Document) -> StructuredDocument:
    """Rebuild a StructuredDocument from persisted (possibly corrected) fields."""
    rows = db.execute(
        select(ExtractedField).where(ExtractedField.document_id == document.id)
    ).scalars().all()
    data: dict = {"schema_version": "1.0", "document_type": document.document_type, "line_items": {}}
    for row in rows:
        try:
            value = json.loads(row.value_json)
        except json.JSONDecodeError:
            value = row.value_json
        path = row.field_path
        if path.startswith("line_items["):
            idx = int(path[len("line_items["):path.index("]")])
            key = path.split(".", 1)[1]
            data["line_items"].setdefault(idx, {})[key] = value
        else:
            data[path] = value
    # Convert line_items dict -> ordered list
    items = [data["line_items"][k] for k in sorted(data["line_items"].keys())]
    data["line_items"] = items
    return StructuredDocument.model_validate(data)


def _learn(db: Session, document: Document, structured: StructuredDocument) -> None:
    """Save suppliers, POs and the document number to the register. A failure here is logged
    and rolled back to a savepoint; it never stops the analysis."""
    try:
        with db.begin_nested():
            register_service.learn_from_document(db, document, structured)
    except Exception as exc:  # type only: the message can carry SQL parameters with document values
        log.error("Register update skipped for document %s (%s)", document.id, type(exc).__name__)


def run_extraction(db: Session, document: Document, correlation_id: str) -> ExtractionRun:
    """Extract a single document into persisted fields. Idempotent per document."""
    run = ExtractionRun(
        workspace_id=document.workspace_id,
        case_id=document.case_id,
        document_id=document.id,
        status="running",
        started_at=utcnow(),
    )
    db.add(run)
    audit_service.record_event(
        db,
        workspace_id=document.workspace_id,
        case_id=document.case_id,
        event_type="document.extraction.started",
        actor_type="system",
        payload={"document_id": document.id, "document_type": document.document_type},
        correlation_id=correlation_id,
        commit=False,
    )
    try:
        storage = get_storage()
        data = storage.get(document.storage_key)
        structured, confidence, provider, model = extract_document(
            data, document.mime_type, document.original_filename, document.document_type
        )
        run.provider, run.model = provider, model[:64]

        # Clear any prior auto fields for re-runs (keep user corrections).
        existing = db.execute(
            select(ExtractedField).where(ExtractedField.document_id == document.id)
        ).scalars().all()
        # Keep human decisions (corrections and verifications) across re-runs.
        human = {"corrected", "verified"}
        corrected = {f.field_path for f in existing if f.review_status in human}
        for f in existing:
            if f.review_status not in human:
                db.delete(f)

        _persist_fields(db, document, structured, confidence, skip=corrected)
        _learn(db, document, structured)

        run.status = "completed"
        run.completed_at = utcnow()
        document.processing_status = "extracted"
        document.error_code = None
        db.add(run)
        db.add(document)
        audit_service.record_event(
            db,
            workspace_id=document.workspace_id,
            case_id=document.case_id,
            event_type="document.extraction.completed",
            actor_type="system",
            payload={
                "document_id": document.id,
                "fields": len(structured.line_items),
                "method": "ocr" if provider != "builtin" else "text",
                "model": model,
            },
            correlation_id=correlation_id,
            commit=False,
        )
    except ExtractionError as exc:
        run.status = "failed"
        run.error_code = exc.code
        run.completed_at = utcnow()
        document.processing_status = "failed"
        document.error_code = exc.code
        db.add(run)
        db.add(document)
        audit_service.record_event(
            db,
            workspace_id=document.workspace_id,
            case_id=document.case_id,
            event_type="document.extraction.failed",
            actor_type="system",
            payload={"document_id": document.id, "error_code": exc.code},
            correlation_id=correlation_id,
            commit=False,
        )
    db.commit()
    return run


def record_extraction(
    db: Session,
    document: Document,
    structured: StructuredDocument,
    confidence: dict[str, float],
    provider: str,
    model: str,
    correlation_id: str,
) -> ExtractionRun:
    """Store fields for a document that was already read (smart intake), so the
    analysis doesn't read it again. Same fields, run record and audit as run_extraction.
    The caller commits."""
    now = utcnow()
    run = ExtractionRun(
        workspace_id=document.workspace_id,
        case_id=document.case_id,
        document_id=document.id,
        status="completed",
        provider=provider,
        model=model[:64],
        started_at=now,
        completed_at=now,
    )
    db.add(run)
    _persist_fields(db, document, structured, confidence, skip=set())
    _learn(db, document, structured)
    document.processing_status = "extracted"
    document.error_code = None
    db.add(document)
    audit_service.record_event(
        db,
        workspace_id=document.workspace_id,
        case_id=document.case_id,
        event_type="document.extraction.completed",
        actor_type="system",
        payload={
            "document_id": document.id,
            "fields": len(structured.line_items),
            "method": "ocr" if provider != "builtin" else "text",
            "model": model,
        },
        correlation_id=correlation_id,
        commit=False,
    )
    return run


def _persist_fields(
    db: Session,
    document: Document,
    structured: StructuredDocument,
    confidence: dict[str, float],
    skip: set[str],
) -> None:
    def add_field(path: str, value) -> None:
        if path in skip or value is None:
            return
        conf = confidence.get(path)
        review = "needs_review" if (conf is not None and conf < 0.6) else "auto"
        db.add(
            ExtractedField(
                workspace_id=document.workspace_id,
                document_id=document.id,
                field_path=path,
                value_json=json.dumps(value),
                confidence=conf,
                review_status=review,
                source_page=(structured.boxes.get(path) or {}).get("page"),
                bbox_json=json.dumps(structured.boxes[path]["box"]) if path in structured.boxes else None,
            )
        )

    for name in (
        "supplier_name",
        "supplier_reference",
        "supplier_email",
        "supplier_phone",
        "supplier_address",
        "document_number",
        "document_date",
        "purchase_order_reference",
        "currency",
        "subtotal",
        "tax",
        "grand_total",
        "delivery_date",
    ):
        add_field(name, getattr(structured, name))

    for idx, li in enumerate(structured.line_items):
        for key in ("sku", "description", "quantity", "received_quantity", "unit", "unit_price", "line_total"):
            add_field(f"line_items[{idx}].{key}", getattr(li, key))


def run_analysis(db: Session, case: Case, correlation_id: str | None = None) -> str:
    """Full bounded workflow for a case. Returns a run id."""
    correlation_id = correlation_id or new_uuid()
    case_service.set_status(db, case, "processing")
    db.commit()

    all_documents = db.execute(
        select(Document)
        .where(Document.case_id == case.id)
        .order_by(Document.created_at)
        .limit(MAX_DOCUMENTS)
    ).scalars().all()
    # A re-uploaded document supersedes earlier uploads of the same type.
    latest: dict[str, Document] = {}
    for d in all_documents:
        # Credit notes from supplier replies are kept on the case but aren't part of the match.
        if d.document_type in MATCHED_TYPES:
            latest[d.document_type] = d
    documents = list(latest.values())

    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="comparison.started",
        actor_type="system",
        correlation_id=correlation_id,
        commit=False,
    )
    db.commit()

    # Extraction stage
    for doc in documents:
        if doc.processing_status in ("queued", "failed", "uploaded"):
            run_extraction(db, doc, correlation_id)

    # Build structured docs from persisted fields
    by_type: dict[str, DocumentRef] = {}
    needs_review = False
    for doc in documents:
        if doc.processing_status != "extracted":
            needs_review = True
            continue
        structured = _rebuild_structured(db, doc)
        by_type[doc.document_type] = DocumentRef(document_id=doc.id, doc=structured)

        has_uncertain = db.execute(
            select(ExtractedField).where(
                ExtractedField.document_id == doc.id,
                ExtractedField.review_status == "needs_review",
            )
        ).first()
        if has_uncertain:
            needs_review = True

    # Duplicate-invoice detection within workspace
    existing_invoice_numbers = _existing_invoice_numbers(db, case)

    from app.services.policy_service import get_policy

    policy = get_policy(db, case.workspace_id)
    config = ComparisonConfig(
        price_tolerance=policy.price_tolerance,
        quantity_tolerance=policy.quantity_tolerance,
    )
    findings = run_comparison(
        by_type.get("purchase_order"),
        by_type.get("invoice"),
        by_type.get("delivery_receipt"),
        config,
        existing_invoice_numbers=existing_invoice_numbers,
        price_history=_price_history(db, case),
    )

    _persist_findings(db, case, findings)

    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="comparison.completed",
        actor_type="system",
        payload={"finding_count": len(findings)},
        correlation_id=correlation_id,
        commit=False,
    )

    if any(f.requires_review for f in findings) or needs_review:
        case_service.set_status(db, case, "needs_review")
    else:
        case_service.set_status(db, case, "ready_for_approval")

    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="investigation.completed",
        actor_type="agent",
        payload={"status": case.status},
        correlation_id=correlation_id,
        commit=False,
    )
    db.commit()
    return correlation_id


_HISTORY_DOCS = 200


def _price_history(db: Session, case: Case) -> dict[str, PricePoint]:
    """Most recent earlier unit price per item (by SKU) from this supplier's other cases
    in the same workspace: purchase orders and invoices that were read."""
    from app.services.normalization import normalize_sku, normalize_text

    name = normalize_text(case.supplier_name)
    rows = db.execute(
        select(Document, Case.case_number, Case.supplier_name, Case.supplier_id)
        .join(Case, Case.id == Document.case_id)
        .where(
            Document.workspace_id == case.workspace_id,
            Document.case_id != case.id,
            Document.document_type.in_(("purchase_order", "invoice")),
            Document.processing_status == "extracted",
        )
        .order_by(Document.created_at.desc())
        .limit(_HISTORY_DOCS * 3)
    ).all()
    docs = [
        (d, number) for d, number, sup_name, sup_id in rows
        if (case.supplier_id and sup_id == case.supplier_id) or (name and normalize_text(sup_name) == name)
    ][:_HISTORY_DOCS]
    if not docs:
        return {}
    fields = db.execute(
        select(ExtractedField).where(ExtractedField.document_id.in_([d.id for d, _ in docs]))
    ).scalars().all()
    by_doc: dict[str, dict[str, str]] = {}
    for f in fields:
        try:
            value = json.loads(f.value_json)
        except json.JSONDecodeError:
            value = f.value_json
        by_doc.setdefault(f.document_id, {})[f.field_path] = "" if value is None else str(value)

    history: dict[str, PricePoint] = {}
    for d, number in docs:  # newest first: the first price seen per SKU wins
        values = by_doc.get(d.id, {})
        when = (values.get("document_date") or "")[:10] or (d.created_at.date().isoformat() if d.created_at else "")
        i = 0
        while f"line_items[{i}].sku" in values or f"line_items[{i}].unit_price" in values:
            key = normalize_sku(values.get(f"line_items[{i}].sku"))
            price = parse_decimal(values.get(f"line_items[{i}].unit_price"))
            if key and price is not None and key not in history:
                history[key] = PricePoint(
                    price=price, document_id=d.id, document_type=d.document_type,
                    field_path=f"line_items[{i}].unit_price", case_number=number, when=when,
                )
            i += 1
    return history


def _existing_invoice_numbers(db: Session, case: Case) -> set[str]:
    from app.services.normalization import normalize_reference

    rows = db.execute(
        select(ExtractedField.value_json)
        .join(Document, Document.id == ExtractedField.document_id)
        .where(
            ExtractedField.workspace_id == case.workspace_id,
            ExtractedField.field_path == "document_number",
            Document.document_type == "invoice",
            Document.case_id != case.id,
        )
    ).scalars().all()
    nums: set[str] = set()
    for r in rows:
        try:
            v = json.loads(r)
        except (json.JSONDecodeError, TypeError):
            v = r
        n = normalize_reference(str(v) if v is not None else None)
        if n:
            nums.add(n)
    return nums


def _persist_findings(db: Session, case: Case, findings) -> None:
    # Remove prior auto-generated open findings for re-analysis idempotency.
    prior = db.execute(
        select(FindingModel).where(
            FindingModel.case_id == case.id, FindingModel.status == "open"
        )
    ).scalars().all()
    for p in prior:
        ev = db.execute(
            select(FindingEvidence).where(FindingEvidence.finding_id == p.id)
        ).scalars().all()
        for e in ev:
            db.delete(e)
        db.delete(p)

    # Human-reviewed findings are kept; do not re-create an identical open copy.
    reviewed = db.execute(
        select(FindingModel).where(
            FindingModel.case_id == case.id, FindingModel.status != "open"
        )
    ).scalars().all()
    reviewed_keys = {(r.rule_id, r.title, r.description) for r in reviewed}

    for f in findings:
        if (f.rule_id, f.title, f.description) in reviewed_keys:
            continue
        model = FindingModel(
            workspace_id=case.workspace_id,
            case_id=case.id,
            finding_type=f.finding_type,
            severity=f.severity,
            title=f.title,
            description=f.description,
            expected_value_json=json.dumps(f.expected_value) if f.expected_value else None,
            observed_value_json=json.dumps(f.observed_value) if f.observed_value else None,
            impact_amount=f.impact_amount if f.impact_amount is not None else None,
            currency=f.currency,
            status="open",
            rule_id=f.rule_id,
            requires_review=f.requires_review,
        )
        db.add(model)
        db.flush()
        for e in f.evidence:
            db.add(
                FindingEvidence(
                    workspace_id=case.workspace_id,
                    finding_id=model.id,
                    document_id=e.document_id,
                    field_path=e.field_path,
                    page_number=e.page_number,
                    snippet=e.snippet,
                )
            )
