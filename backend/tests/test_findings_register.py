"""Workspace findings register and the reopen (undo) decision."""

from __future__ import annotations

import json

from tests.test_api_flow import _login, _seed_two_workspaces


def _analyzed_case(client, ws_id, hdr):
    case = client.post(
        f"/api/v1/workspaces/{ws_id}/cases",
        headers=hdr,
        json={"title": "Northstar", "supplier_name": "Northstar", "supplier_reference": "PO-1048", "currency": "USD"},
    ).json()
    cid = case["id"]

    def upload(dtype, payload):
        content = ("__OPSWARDEN_JSON__" + json.dumps(payload)).encode("utf-8")
        r = client.post(
            f"/api/v1/cases/{cid}/documents",
            headers=hdr,
            files={"file": (f"{dtype}.json", content, "application/json")},
            data={"document_type": dtype},
        )
        assert r.status_code == 202, r.text

    upload("purchase_order", {"document_type": "purchase_order", "supplier_name": "Northstar", "document_number": "PO-1048", "currency": "USD", "line_items": [{"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"}]})
    upload("delivery_receipt", {"document_type": "delivery_receipt", "supplier_name": "Northstar", "purchase_order_reference": "PO-1048", "line_items": [{"sku": "PROD-B", "received_quantity": "40"}]})
    upload("invoice", {"document_type": "invoice", "supplier_name": "Northstar", "document_number": "INV-8821", "purchase_order_reference": "PO-1048", "currency": "USD", "subtotal": "600.00", "tax": "0.00", "grand_total": "600.00", "line_items": [{"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"}]})
    r = client.post(f"/api/v1/cases/{cid}/analyze", headers=hdr)
    assert r.status_code == 202, r.text
    return case


def test_workspace_findings_register_lists_findings_with_case_context(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _analyzed_case(client, ids["ws_a"], hdr)

    r = client.get(f"/api/v1/workspaces/{ids['ws_a']}/findings", headers=hdr)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert rows, "expected at least one finding"
    over = next(f for f in rows if f["rule_id"] == "INVOICE_QTY_GT_RECEIVED")
    assert over["case_id"] == case["id"]
    assert over["case_number"] == case["case_number"]
    assert over["supplier_name"] == "Northstar"
    assert over["currency"] == "USD"
    assert "created_at" in over


def test_workspace_findings_register_is_tenant_isolated(client):
    ids = _seed_two_workspaces()
    hdr_a = _login(client, "admin_a@test.io")
    hdr_b = _login(client, "admin_b@test.io")
    _analyzed_case(client, ids["ws_a"], hdr_a)

    # B cannot read A's register at all.
    r = client.get(f"/api/v1/workspaces/{ids['ws_a']}/findings", headers=hdr_b)
    assert r.status_code == 404
    # B's own register is empty.
    r = client.get(f"/api/v1/workspaces/{ids['ws_b']}/findings", headers=hdr_b)
    assert r.status_code == 200
    assert r.json() == []


def test_dismissed_finding_can_be_reopened(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _analyzed_case(client, ids["ws_a"], hdr)
    finding = client.get(f"/api/v1/cases/{case['id']}/findings", headers=hdr).json()["items"][0]

    r = client.post(f"/api/v1/findings/{finding['id']}/review", headers=hdr, json={"decision": "dismiss", "comment": "Credit note received"})
    assert r.status_code == 200 and r.json()["status"] == "dismissed"

    r = client.post(f"/api/v1/findings/{finding['id']}/review", headers=hdr, json={"decision": "reopen"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "open"


def test_contributor_cannot_reopen(client):
    ids = _seed_two_workspaces()
    hdr_admin = _login(client, "admin_a@test.io")
    hdr_contrib = _login(client, "contrib_a@test.io")
    case = _analyzed_case(client, ids["ws_a"], hdr_admin)
    finding = client.get(f"/api/v1/cases/{case['id']}/findings", headers=hdr_admin).json()["items"][0]

    r = client.post(f"/api/v1/findings/{finding['id']}/review", headers=hdr_contrib, json={"decision": "reopen"})
    assert r.status_code == 403
