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
from app.services import audit_service, case_service
from app.services.comparison_service import (
    ComparisonConfig,
    DocumentRef,
    run_comparison,
)
from app.services.doc_schema import StructuredDocument
from app.services.extraction_service import ExtractionError, extract_document
from app.integrations.storage.provider import get_storage

log = get_logger("opswarden.orchestrator")

MAX_DOCUMENTS = 12


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
            )
        )

    for name in (
        "supplier_name",
        "supplier_reference",
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
