"""Idempotent demo seed data (development only).

Creates one workspace, a user for each role, and four clearly synthetic
procurement scenarios. Every finding, metric, and approval below is produced by
the real pipeline (extraction -> deterministic comparison -> approval gate);
nothing is hardcoded into dashboard numbers.

  1. Northstar Office Supplies  - PO 50 / received 40 / invoiced 50 (left as a
     draft with documents attached, so the live demo can run the analysis).
  2. Harbor Industrial Supply   - unit price above PO; email awaiting approval.
  3. Meridian Foods             - invoice totals don't reconcile; receipt missing.
  4. Kestrel Packaging          - perfect three-way match; resolved.
"""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import orchestrator
from app.core.security import hash_password
from app.db import SessionLocal, new_uuid
from app.integrations.storage.provider import get_storage
from app.models.approval import Approval
from app.models.case import Case
from app.models.document import Document
from app.models.finding import Finding
from app.models.recommendation import Recommendation
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services import approval_service, audit_service, case_service, investigation_service

DEMO_PASSWORD = "Password123!"

_USERS = [
    ("admin@opswarden.app", "Avery Admin", "admin"),
    ("reviewer@opswarden.app", "Riley Reviewer", "reviewer"),
    ("contributor@opswarden.app", "Casey Contributor", "contributor"),
]


def _fixture(payload: dict) -> str:
    return "__OPSWARDEN_JSON__" + json.dumps(payload)


def _line(sku: str, desc: str, qty: str | None = None, price: str | None = None, total: str | None = None, received: str | None = None) -> dict:
    item: dict = {"sku": sku, "description": desc}
    if qty is not None:
        item["quantity"] = qty
    if price is not None:
        item["unit_price"] = price
    if total is not None:
        item["line_total"] = total
    if received is not None:
        item["received_quantity"] = received
    return item


SCENARIOS = [
    {
        "title": "Northstar invoice discrepancy",
        "supplier": "Northstar Office Supplies",
        "po": "PO-1048",
        "notes": "Please verify delivered quantities against the invoice.",
        "owner": "admin",
        "analyze": False,
        "docs": {
            "purchase_order": ("PO-1048.json", {
                "supplier_name": "Northstar Office Supplies", "document_number": "PO-1048",
                "purchase_order_reference": "PO-1048", "currency": "USD",
                "line_items": [_line("PROD-B", "Product B", "50", "12.00", "600.00")],
            }),
            "delivery_receipt": ("DR-3391.json", {
                "supplier_name": "Northstar Office Supplies", "document_number": "DR-3391",
                "purchase_order_reference": "PO-1048",
                "line_items": [_line("PROD-B", "Product B", received="40")],
            }),
            "invoice": ("INV-8821.json", {
                "supplier_name": "Northstar Office Supplies", "document_number": "INV-8821",
                "purchase_order_reference": "PO-1048", "currency": "USD",
                "subtotal": "600.00", "tax": "0.00", "grand_total": "600.00",
                "line_items": [_line("PROD-B", "Product B", "50", "12.00", "600.00")],
            }),
        },
    },
    {
        "title": "Harbor Industrial price check",
        "supplier": "Harbor Industrial Supply",
        "po": "PO-2207",
        "notes": "Invoice unit price looks higher than agreed.",
        "owner": "reviewer",
        "analyze": True,
        "request_approval": True,
        "docs": {
            "purchase_order": ("PO-2207.json", {
                "supplier_name": "Harbor Industrial Supply", "document_number": "PO-2207",
                "purchase_order_reference": "PO-2207", "currency": "USD",
                "line_items": [
                    _line("HX-200", "Hex bolts M8, box of 100", "120", "4.50", "540.00"),
                    _line("WS-010", "Flat washers M8, box of 100", "60", "1.20", "72.00"),
                ],
            }),
            "delivery_receipt": ("DR-5102.json", {
                "supplier_name": "Harbor Industrial Supply", "document_number": "DR-5102",
                "purchase_order_reference": "PO-2207",
                "line_items": [
                    _line("HX-200", "Hex bolts M8, box of 100", received="120"),
                    _line("WS-010", "Flat washers M8, box of 100", received="60"),
                ],
            }),
            "invoice": ("INV-5310.json", {
                "supplier_name": "Harbor Industrial Supply", "document_number": "INV-5310",
                "purchase_order_reference": "PO-2207", "currency": "USD",
                "subtotal": "666.00", "tax": "0.00", "grand_total": "666.00",
                "line_items": [
                    _line("HX-200", "Hex bolts M8, box of 100", "120", "4.95", "594.00"),
                    _line("WS-010", "Flat washers M8, box of 100", "60", "1.20", "72.00"),
                ],
            }),
        },
    },
    {
        "title": "Meridian Foods invoice totals",
        "supplier": "Meridian Foods Ltd",
        "po": "PO-2301",
        "notes": "Delivery receipt still to be scanned by the warehouse.",
        "owner": "contributor",
        "analyze": True,
        "docs": {
            "purchase_order": ("PO-2301.json", {
                "supplier_name": "Meridian Foods Ltd", "document_number": "PO-2301",
                "purchase_order_reference": "PO-2301", "currency": "USD",
                "line_items": [_line("MF-OIL5", "Sunflower oil, 5 L", "40", "12.00", "480.00")],
            }),
            "invoice": ("INV-9014.json", {
                "supplier_name": "Meridian Foods Ltd", "document_number": "INV-9014",
                "purchase_order_reference": "PO-2301", "currency": "USD",
                "subtotal": "480.00", "tax": "76.80", "grand_total": "566.80",
                "line_items": [_line("MF-OIL5", "Sunflower oil, 5 L", "40", "12.00", "480.00")],
            }),
        },
    },
    {
        "title": "Kestrel restock reconciliation",
        "supplier": "Kestrel Packaging Co.",
        "po": "PO-1990",
        "notes": None,
        "owner": "reviewer",
        "analyze": True,
        "resolve": True,
        "docs": {
            "purchase_order": ("PO-1990.json", {
                "supplier_name": "Kestrel Packaging Co.", "document_number": "PO-1990",
                "purchase_order_reference": "PO-1990", "currency": "USD",
                "line_items": [_line("KP-BOX-L", "Shipping cartons, large", "200", "0.85", "170.00")],
            }),
            "delivery_receipt": ("DR-4410.json", {
                "supplier_name": "Kestrel Packaging Co.", "document_number": "DR-4410",
                "purchase_order_reference": "PO-1990",
                "line_items": [_line("KP-BOX-L", "Shipping cartons, large", received="200")],
            }),
            "invoice": ("INV-7702.json", {
                "supplier_name": "Kestrel Packaging Co.", "document_number": "INV-7702",
                "purchase_order_reference": "PO-1990", "currency": "USD",
                "subtotal": "170.00", "tax": "0.00", "grand_total": "170.00",
                "line_items": [_line("KP-BOX-L", "Shipping cartons, large", "200", "0.85", "170.00")],
            }),
        },
    },
]


def _add_document(db: Session, case: Case, user_id: str, dtype: str, filename: str, payload: dict) -> None:
    data = _fixture({"document_type": dtype, **payload}).encode("utf-8")
    key = f"{case.workspace_id}_seed_{dtype}_{case.id[:8]}"
    get_storage().put(key, data)
    db.add(
        Document(
            workspace_id=case.workspace_id,
            case_id=case.id,
            document_type=dtype,
            storage_key=key,
            original_filename=filename,
            mime_type="application/json",
            size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
            processing_status="queued",
            uploaded_by=user_id,
        )
    )
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="document.uploaded",
        actor_type="user",
        actor_id=user_id,
        payload={"document_type": dtype, "filename": filename},
        commit=False,
    )


def _request_email_approval(db: Session, case: Case, requester: User) -> None:
    """Same steps as the email-draft and request-approval endpoints."""
    findings = db.execute(select(Finding).where(Finding.case_id == case.id)).scalars().all()
    subject, body = investigation_service.build_email_draft(
        case.case_number, case.supplier_name, case.supplier_reference, findings, case.currency
    )
    payload = {"subject": subject, "body": body, "recipient": None, "case_id": case.id}
    rec = Recommendation(
        workspace_id=case.workspace_id,
        case_id=case.id,
        recommendation_type="supplier_clarification_email",
        summary=subject,
        rationale=investigation_service.build_summary(case.title, case.supplier_name, findings),
        payload_json=json.dumps(payload),
        status="draft",
    )
    db.add(rec)
    db.flush()
    audit_service.record_event(
        db, workspace_id=case.workspace_id, case_id=case.id, event_type="recommendation.generated",
        actor_type="agent", payload={"recommendation_id": rec.id, "type": rec.recommendation_type}, commit=False,
    )
    phash = approval_service.payload_hash(payload)
    approval = Approval(
        workspace_id=case.workspace_id,
        case_id=case.id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        action_payload_json=json.dumps(payload),
        payload_hash=phash,
        status="pending",
        requested_by=requester.id,
        idempotency_key=new_uuid(),
    )
    db.add(approval)
    db.flush()
    audit_service.record_event(
        db, workspace_id=case.workspace_id, case_id=case.id, event_type="approval.requested",
        actor_type="user", actor_id=requester.id, payload={"approval_id": approval.id, "payload_hash": phash},
        commit=False,
    )
    case_service.set_status(db, case, "ready_for_approval", actor_type="user", actor_id=requester.id)
    db.commit()


def seed() -> None:
    db = SessionLocal()
    try:
        if db.execute(select(Workspace)).first():
            return  # already seeded

        workspace = Workspace(name="Northstar Procurement")
        db.add(workspace)
        db.flush()

        users: dict[str, User] = {}
        for email, name, role in _USERS:
            user = User(email=email, full_name=name, hashed_password=hash_password(DEMO_PASSWORD))
            db.add(user)
            db.flush()
            users[role] = user
            db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=role))
        db.commit()

        for sc in SCENARIOS:
            owner = users[sc["owner"]]
            case = Case(
                workspace_id=workspace.id,
                case_number=case_service.next_case_number(db, workspace),
                title=sc["title"],
                supplier_name=sc["supplier"],
                supplier_reference=sc["po"],
                currency="USD",
                notes=sc["notes"],
                status="draft",
                owner_user_id=owner.id,
                created_by=owner.id,
            )
            db.add(case)
            db.flush()
            audit_service.record_event(
                db, workspace_id=workspace.id, case_id=case.id, event_type="case.created",
                actor_type="user", actor_id=owner.id,
                payload={"case_number": case.case_number, "title": case.title}, commit=False,
            )
            for dtype, (filename, payload) in sc["docs"].items():
                _add_document(db, case, owner.id, dtype, filename, payload)
            db.commit()

            if sc.get("analyze"):
                orchestrator.run_analysis(db, case)
            if sc.get("request_approval"):
                _request_email_approval(db, case, owner)
            if sc.get("resolve"):
                reviewer = users["reviewer"]
                case_service.set_status(db, case, "resolved", actor_type="user", actor_id=reviewer.id)
                audit_service.record_event(
                    db, workspace_id=workspace.id, case_id=case.id, event_type="case.resolved",
                    actor_type="user", actor_id=reviewer.id,
                    payload={"comment": "Three-way match confirmed. No discrepancies."}, commit=False,
                )
                db.commit()
    finally:
        db.close()
