"""Smart intake: documents dropped without a case are read, routed and filed."""
from __future__ import annotations

import json

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.db import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.registry import PurchaseOrder, Supplier
from app.services import intake_service
from app.services.doc_schema import StructuredDocument
from tests.test_api_flow import _login, _seed_two_workspaces
from tests.test_registry import PDF, _po, _supplier


def _json_file(payload: dict, name: str):
    content = ("__OPSWARDEN_JSON__" + json.dumps(payload)).encode("utf-8")
    return {"file": (name, content, "application/json")}


INVOICE = {
    "document_type": "invoice", "supplier_name": "Northstar Office Supplies", "document_number": "INV-8821",
    "purchase_order_reference": "po 2231", "currency": "EUR", "subtotal": "600.00", "tax": "0.00", "grand_total": "600.00",
    "line_items": [{"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"}],
}
RECEIPT = {
    "document_type": "delivery_receipt", "supplier_name": "Northstar Office Supplies",
    "purchase_order_reference": "PO-2231", "line_items": [{"sku": "PROD-B", "received_quantity": "40"}],
}


def _intake(client, hdr, ws, dtype, payload, name="doc.json"):
    return client.post(
        f"/api/v1/workspaces/{ws}/intake", headers=hdr, data={"document_type": dtype}, files=_json_file(payload, name)
    )


def _registered_po(client, hdr, ws, with_file=True):
    s = _supplier(client, hdr, ws)
    po = _po(client, hdr, ws, s["id"])
    if with_file:
        r = client.put(f"/api/v1/registry/purchase-orders/{po['id']}/file", headers=hdr, files={"file": ("po-2231.pdf", PDF, "application/pdf")})
        assert r.status_code in (200, 201), r.text
    return s, po


def test_invoice_routes_to_registered_po_and_attaches_its_file(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    supplier, po = _registered_po(client, hdr, ids["ws_a"])

    r = _intake(client, hdr, ids["ws_a"], "invoice", INVOICE, "inv-8821.json")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["created"] is True and body["matched_by"] == "purchase_order"
    assert body["reference"] == "PO-2231" and body["supplier_name"] == supplier["name"]
    # The registered PO file came along, so only the receipt is missing. Invoice + PO is enough to analyze.
    assert body["missing"] == ["delivery_receipt"]
    assert body["analysis_started"] is True

    case = client.get(f"/api/v1/cases/{body['case_id']}", headers=hdr).json()
    assert case["purchase_order_id"] == po["id"] and case["supplier_id"] == supplier["id"] and case["currency"] == "EUR"
    docs = client.get(f"/api/v1/cases/{body['case_id']}/documents", headers=hdr).json()
    assert sorted(d["document_type"] for d in docs) == ["invoice", "purchase_order"]

    fields = client.get(f"/api/v1/documents/{body['document_id']}/extracted-fields", headers=hdr).json()
    assert fields  # stored at intake, so the analysis didn't need to read the file again

    db = SessionLocal()
    routed = db.query(AuditEvent).filter(AuditEvent.case_id == body["case_id"], AuditEvent.event_type == "intake.routed").one()
    db.close()
    payload = json.loads(routed.event_payload_json)
    assert payload["matched_by"] == "purchase_order" and payload["created_case"] is True


def test_second_document_joins_the_same_case(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    _registered_po(client, hdr, ids["ws_a"], with_file=False)

    first = _intake(client, hdr, ids["ws_a"], "delivery_receipt", RECEIPT).json()
    assert first["created"] is True and first["analysis_started"] is False
    assert set(first["missing"]) == {"purchase_order", "invoice"}
    assert "Add the purchase order and invoice" in first["message"]

    second = _intake(client, hdr, ids["ws_a"], "invoice", INVOICE).json()
    assert second["case_id"] == first["case_id"]
    assert second["created"] is False and second["matched_by"] == "open_case"
    assert second["analysis_started"] is True
    findings = client.get(f"/api/v1/cases/{second['case_id']}/findings", headers=hdr).json()["items"]
    assert "INVOICE_QTY_GT_RECEIVED" in {f["rule_id"] for f in findings}


def test_falls_back_to_supplier_then_document_details(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    supplier = _supplier(client, hdr, ids["ws_a"])

    by_supplier = _intake(client, hdr, ids["ws_a"], "invoice", {**INVOICE, "purchase_order_reference": "PO-7777"}).json()
    assert by_supplier["matched_by"] == "supplier" and by_supplier["supplier_name"] == supplier["name"]
    assert by_supplier["reference"] == "PO-7777"

    unknown = {**INVOICE, "supplier_name": "Harbor Freight Co", "purchase_order_reference": "HB-12"}
    by_doc = _intake(client, hdr, ids["ws_a"], "invoice", unknown).json()
    assert by_doc["matched_by"] == "document" and by_doc["supplier_name"] == "Harbor Freight Co"
    case = client.get(f"/api/v1/cases/{by_doc['case_id']}", headers=hdr).json()
    assert case["title"] == "HB-12 · Harbor Freight Co"
    # The supplier read from the document is now in the register and linked to the case.
    registered = client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr).json()
    harbor = next(s for s in registered if s["name"] == "Harbor Freight Co")
    assert case["supplier_id"] == harbor["id"]


def test_never_routes_across_workspaces_or_into_closed_cases(client):
    ids = _seed_two_workspaces()
    hdr_a = _login(client, "admin_a@test.io")
    hdr_b = _login(client, "admin_b@test.io")
    _registered_po(client, hdr_a, ids["ws_a"], with_file=False)

    # Workspace B drops a document citing A's purchase order: B gets its own case.
    b = _intake(client, hdr_b, ids["ws_b"], "invoice", INVOICE).json()
    assert b["matched_by"] == "document" and b["created"] is True
    db = SessionLocal()
    assert db.get(Case, b["case_id"]).workspace_id == ids["ws_b"]
    db.close()

    # A resolved case for the same PO is left alone.
    a1 = _intake(client, hdr_a, ids["ws_a"], "delivery_receipt", RECEIPT).json()
    db = SessionLocal()
    db.get(Case, a1["case_id"]).status = "resolved"
    db.commit()
    db.close()
    a2 = _intake(client, hdr_a, ids["ws_a"], "delivery_receipt", RECEIPT).json()
    assert a2["case_id"] != a1["case_id"] and a2["matched_by"] == "purchase_order"


def test_permissions_and_membership(client):
    ids = _seed_two_workspaces()
    contrib = _login(client, "contrib_a@test.io")
    assert _intake(client, contrib, ids["ws_a"], "invoice", INVOICE).status_code == 201
    outsider = _login(client, "admin_b@test.io")
    assert _intake(client, outsider, ids["ws_a"], "invoice", INVOICE).status_code == 404
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/intake", data={"document_type": "invoice"}, files=_json_file(INVOICE, "x.json")).status_code == 401


def test_bad_files_create_nothing(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    url = f"/api/v1/workspaces/{ids['ws_a']}/intake"
    spoofed = client.post(url, headers=hdr, data={"document_type": "invoice"}, files={"file": ("x.pdf", b"MZ\x90\x00", "application/pdf")})
    assert spoofed.status_code == 415
    empty = client.post(url, headers=hdr, data={"document_type": "invoice"}, files={"file": ("x.pdf", b"", "application/pdf")})
    assert empty.status_code == 400
    wrong_type = _intake(client, hdr, ids["ws_a"], "contract", INVOICE)
    assert wrong_type.status_code == 422 and wrong_type.json()["error"]["code"] == "INVALID_DOCUMENT_TYPE"
    unreadable = client.post(url, headers=hdr, data={"document_type": "invoice"}, files={"file": ("scan.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")})
    assert unreadable.status_code == 422 and unreadable.json()["error"]["code"] == "UNREADABLE_DOCUMENT"
    db = SessionLocal()
    assert db.query(Case).filter(Case.workspace_id == ids["ws_a"]).count() == 0
    db.close()


# -- property: reference formatting never changes the routing -------------------------------

def _variants():
    sep = st.sampled_from(["", " ", "-", "_", "/", ".", " - "])
    return st.builds(
        lambda prefix, s, digits, upper, pad: f"{pad}{prefix.upper() if upper else prefix.lower()}{s}{digits}{pad}",
        st.just("po"), sep, st.just("2231"), st.booleans(), st.sampled_from(["", " ", "  "]),
    )


_PROPERTY_STATE: dict = {}


def _property_po():
    """One workspace with one registered PO, created once for the property test."""
    if not _PROPERTY_STATE:
        from app.db import Base, engine
        from app.models.workspace import Workspace

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        ws = Workspace(name="Property")
        db.add(ws)
        db.flush()
        sup = Supplier(workspace_id=ws.id, name="Northstar", normalized_name="northstar", created_by=ws.id)
        db.add(sup)
        db.flush()
        po = PurchaseOrder(workspace_id=ws.id, supplier_id=sup.id, po_number="PO-2231", normalized_number="PO2231", created_by=ws.id)
        db.add(po)
        db.commit()
        _PROPERTY_STATE.update(ws=ws.id, po=po.id)
        db.close()
    return _PROPERTY_STATE["ws"], _PROPERTY_STATE["po"]


@settings(max_examples=150, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(_variants(), st.sampled_from(["invoice", "delivery_receipt"]))
def test_property_any_reference_formatting_routes_to_the_same_po(reference, dtype):
    ws, po_id = _property_po()
    doc = StructuredDocument(document_type=dtype, purchase_order_reference=reference)
    assert intake_service.reference_of(doc) == "PO2231"
    db = SessionLocal()
    try:
        found = intake_service.find_registered_po(db, ws, intake_service.reference_of(doc))
        assert found is not None and found.id == po_id
    finally:
        db.close()
