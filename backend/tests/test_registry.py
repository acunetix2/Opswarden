"""Supplier and purchase-order register, opening cases from it, and workspace search."""
from __future__ import annotations

from tests.test_api_flow import _login, _seed_two_workspaces

PDF = b"%PDF-1.4\n% test purchase order\n"


def _setup(client):
    ids = _seed_two_workspaces()
    return ids, _login(client, "admin_a@test.io")


def _supplier(client, hdr, ws, **extra):
    r = client.post(f"/api/v1/workspaces/{ws}/registry/suppliers", headers=hdr, json={"name": "Northstar Office Supplies", "contact_email": "ap@northstar.example", "default_currency": "EUR", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _po(client, hdr, ws, supplier_id, **extra):
    r = client.post(f"/api/v1/workspaces/{ws}/registry/purchase-orders", headers=hdr, json={"supplier_id": supplier_id, "po_number": "PO-2231", "total_amount": "1,143.00", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_register_supplier_and_po_then_open_case_from_po(client):
    ids, hdr = _setup(client)
    ws = ids["ws_a"]
    s = _supplier(client, hdr, ws)
    po = _po(client, hdr, ws, s["id"])
    assert po["currency"] == "EUR" and po["total_amount"] == "1143.00" and po["has_file"] is False

    up = client.put(f"/api/v1/registry/purchase-orders/{po['id']}/file", headers=hdr, files={"file": ("po-2231.pdf", PDF, "application/pdf")})
    assert up.status_code == 200 and up.json()["has_file"] is True

    case = client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"purchase_order_id": po["id"]})
    assert case.status_code == 201, case.text
    c = case.json()
    assert c["supplier_name"] == "Northstar Office Supplies" and c["supplier_reference"] == "PO-2231"
    assert c["currency"] == "EUR" and c["title"] == "PO-2231 · Northstar Office Supplies"
    assert c["supplier_id"] == s["id"] and c["purchase_order_id"] == po["id"]
    assert c["supplier_contact_email"] == "ap@northstar.example"

    docs = client.get(f"/api/v1/cases/{c['id']}/documents", headers=hdr).json()
    assert [d["document_type"] for d in docs] == ["purchase_order"]
    assert client.get(f"/api/v1/documents/{docs[0]['id']}/download", headers=hdr).content == PDF

    # Replacing the register file afterwards doesn't touch the case's own copy.
    client.put(f"/api/v1/registry/purchase-orders/{po['id']}/file", headers=hdr, files={"file": ("v2.pdf", b"%PDF-1.4 v2", "application/pdf")})
    assert client.get(f"/api/v1/documents/{docs[0]['id']}/download", headers=hdr).content == PDF

    pos = client.get(f"/api/v1/workspaces/{ws}/registry/purchase-orders", headers=hdr).json()
    assert pos[0]["case_count"] == 1 and pos[0]["latest_case_id"] == c["id"]
    sups = client.get(f"/api/v1/workspaces/{ws}/registry/suppliers", headers=hdr).json()
    assert sups[0]["total_cases"] == 1 and sups[0]["open_purchase_orders"] == 1


def test_email_draft_uses_registered_contact(client):
    ids, hdr = _setup(client)
    s = _supplier(client, hdr, ids["ws_a"])
    c = client.post(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "Check", "supplier_id": s["id"]}).json()
    assert c["supplier_name"] == "Northstar Office Supplies"
    draft = client.post(f"/api/v1/cases/{c['id']}/recommendations/email-draft", headers=hdr).json()
    assert draft["recipient"] == "ap@northstar.example"


def test_duplicates_and_validation(client):
    ids, hdr = _setup(client)
    ws = ids["ws_a"]
    s = _supplier(client, hdr, ws)
    dup = client.post(f"/api/v1/workspaces/{ws}/registry/suppliers", headers=hdr, json={"name": "  northstar office   supplies "})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "SUPPLIER_EXISTS"
    _po(client, hdr, ws, s["id"])
    assert client.post(f"/api/v1/workspaces/{ws}/registry/purchase-orders", headers=hdr, json={"supplier_id": s["id"], "po_number": "po 2231"}).status_code == 409
    bad = client.post(f"/api/v1/workspaces/{ws}/registry/purchase-orders", headers=hdr, json={"supplier_id": s["id"], "po_number": "PO-9", "total_amount": "lots"})
    assert bad.json()["error"]["code"] == "INVALID_AMOUNT"
    assert client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={}).json()["error"]["code"] == "TITLE_REQUIRED"


def test_register_is_workspace_scoped_and_role_checked(client):
    ids, hdr = _setup(client)
    s = _supplier(client, hdr, ids["ws_a"])
    po = _po(client, hdr, ids["ws_a"], s["id"])

    hdr_b = _login(client, "admin_b@test.io")
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr_b).status_code == 404
    assert client.patch(f"/api/v1/registry/suppliers/{s['id']}", headers=hdr_b, json={"name": "X"}).status_code == 404
    assert client.get(f"/api/v1/registry/purchase-orders/{po['id']}/file", headers=hdr_b).status_code == 404
    # Another workspace's PO can't be used to open a case (or to read its file through one).
    r = client.post(f"/api/v1/workspaces/{ids['ws_b']}/cases", headers=hdr_b, json={"purchase_order_id": po["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "PURCHASE_ORDER_NOT_FOUND"

    contrib = _login(client, "contrib_a@test.io")
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=contrib).status_code == 200
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=contrib, json={"name": "New"}).status_code == 403
    # Contributors can still open a case from the register.
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=contrib, json={"purchase_order_id": po["id"]}).status_code == 201


def test_import_suppliers_from_existing_cases(client):
    ids, hdr = _setup(client)
    ws = ids["ws_a"]
    for name in ("Kestrel Packaging", "kestrel packaging", "Harbor Supply"):
        client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": "Old", "supplier_name": name})
    r = client.post(f"/api/v1/workspaces/{ws}/registry/suppliers/import-from-cases", headers=hdr).json()
    assert r == {"created": 2, "linked_cases": 3}
    assert client.post(f"/api/v1/workspaces/{ws}/registry/suppliers/import-from-cases", headers=hdr).json() == {"created": 0, "linked_cases": 0}
    names = sorted(s["name"] for s in client.get(f"/api/v1/workspaces/{ws}/registry/suppliers", headers=hdr).json())
    assert names == ["Harbor Supply", "Kestrel Packaging"]


def test_search_spans_cases_suppliers_and_pos(client):
    ids, hdr = _setup(client)
    ws = ids["ws_a"]
    s = _supplier(client, hdr, ws)
    _po(client, hdr, ws, s["id"])
    client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": "Northstar short delivery", "supplier_id": s["id"]})
    hits = client.get(f"/api/v1/workspaces/{ws}/search", headers=hdr, params={"q": "north"}).json()["hits"]
    kinds = {h["kind"] for h in hits}
    assert {"case", "supplier"} <= kinds
    assert any(h["kind"] == "purchase_order" for h in client.get(f"/api/v1/workspaces/{ws}/search", headers=hdr, params={"q": "2231"}).json()["hits"])
    hdr_b = _login(client, "admin_b@test.io")
    assert client.get(f"/api/v1/workspaces/{ws}/search", headers=hdr_b, params={"q": "north"}).status_code == 404
