"""Integration tests: auth, tenant isolation, approval gate, end-to-end flow."""
from __future__ import annotations

import json

from app.core.security import hash_password
from app.db import SessionLocal
from app.models.case import Case
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services import case_service


def _mk_user(db, email, role, workspace):
    u = User(email=email, full_name=email, hashed_password=hash_password("pw"))
    db.add(u)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=u.id, role=role))
    return u


def _seed_two_workspaces():
    db = SessionLocal()
    ws_a = Workspace(name="A")
    ws_b = Workspace(name="B")
    db.add_all([ws_a, ws_b])
    db.flush()
    admin_a = _mk_user(db, "admin_a@test.io", "admin", ws_a)
    contrib_a = _mk_user(db, "contrib_a@test.io", "contributor", ws_a)
    admin_b = _mk_user(db, "admin_b@test.io", "admin", ws_b)
    db.commit()
    ids = {
        "ws_a": ws_a.id,
        "ws_b": ws_b.id,
    }
    db.close()
    return ids


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "pw"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_tenant_isolation(client):
    ids = _seed_two_workspaces()
    hdr_a = _login(client, "admin_a@test.io")
    hdr_b = _login(client, "admin_b@test.io")

    # Admin A creates a case in workspace A.
    r = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases",
        headers=hdr_a,
        json={"title": "Case A", "currency": "USD"},
    )
    assert r.status_code == 201, r.text
    case_id = r.json()["id"]

    # Admin B (different workspace) must NOT read it; existence is hidden (404).
    r = client.get(f"/api/v1/cases/{case_id}", headers=hdr_b)
    assert r.status_code == 404

    # Admin B cannot create a case in workspace A either.
    r = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases",
        headers=hdr_b,
        json={"title": "Intruder", "currency": "USD"},
    )
    assert r.status_code == 404


def test_contributor_cannot_approve(client):
    ids = _seed_two_workspaces()
    hdr_admin = _login(client, "admin_a@test.io")
    hdr_contrib = _login(client, "contrib_a@test.io")

    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases",
        headers=hdr_admin,
        json={"title": "Case", "supplier_reference": "PO-1", "currency": "USD"},
    ).json()

    draft = client.post(
        f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr_admin
    )
    assert draft.status_code == 200, draft.text
    rec_id = draft.json()["recommendation_id"]

    appr = client.post(
        f"/api/v1/recommendations/{rec_id}/request-approval", headers=hdr_admin
    )
    assert appr.status_code == 200, appr.text
    approval_id = appr.json()["approval_id"]

    # Contributor lacks DECIDE_APPROVAL permission.
    r = client.post(
        f"/api/v1/approvals/{approval_id}/decision",
        headers=hdr_contrib,
        json={"decision": "approve"},
    )
    assert r.status_code == 403


def test_rejected_approval_cannot_execute(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}
    ).json()
    rec_id = client.post(
        f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr
    ).json()["recommendation_id"]
    approval_id = client.post(
        f"/api/v1/recommendations/{rec_id}/request-approval", headers=hdr
    ).json()["approval_id"]

    client.post(
        f"/api/v1/approvals/{approval_id}/decision", headers=hdr, json={"decision": "reject"}
    )
    r = client.post(f"/api/v1/approvals/{approval_id}/execute", headers=hdr)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "APPROVAL_REJECTED"


def test_approve_and_execute_export_fallback_and_idempotent(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}
    ).json()
    rec_id = client.post(
        f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr
    ).json()["recommendation_id"]
    approval_id = client.post(
        f"/api/v1/recommendations/{rec_id}/request-approval", headers=hdr
    ).json()["approval_id"]
    client.post(
        f"/api/v1/approvals/{approval_id}/decision", headers=hdr, json={"decision": "approve"}
    )

    # No email provider configured -> export fallback, not a fake send.
    r1 = client.post(f"/api/v1/approvals/{approval_id}/execute", headers=hdr)
    assert r1.status_code == 200
    assert r1.json()["export"] is not None
    assert r1.json()["provider_reference"] is None


def test_payload_change_invalidates_approval(client):
    """A changed payload after approval must not execute with the old approval."""
    from app.models.approval import Approval

    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}
    ).json()
    rec_id = client.post(
        f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr
    ).json()["recommendation_id"]
    approval_id = client.post(
        f"/api/v1/recommendations/{rec_id}/request-approval", headers=hdr
    ).json()["approval_id"]
    client.post(
        f"/api/v1/approvals/{approval_id}/decision", headers=hdr, json={"decision": "approve"}
    )

    # Tamper with the stored payload after approval.
    db = SessionLocal()
    appr = db.get(Approval, approval_id)
    tampered = json.loads(appr.action_payload_json)
    tampered["body"] = "TAMPERED CONTENT"
    appr.action_payload_json = json.dumps(tampered)
    db.add(appr)
    db.commit()
    db.close()

    r = client.post(f"/api/v1/approvals/{approval_id}/execute", headers=hdr)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "PAYLOAD_CHANGED"


def test_end_to_end_seeded_scenario(client):
    """Upload-free E2E using JSON fixtures: create, upload, analyze, finding."""
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases",
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

    findings = client.get(f"/api/v1/cases/{cid}/findings", headers=hdr).json()["items"]
    rules = {f["rule_id"] for f in findings}
    assert "INVOICE_QTY_GT_RECEIVED" in rules
    # Each finding carries evidence references.
    over = next(f for f in findings if f["rule_id"] == "INVOICE_QTY_GT_RECEIVED")
    assert len(over["evidence"]) >= 2

    # Activity timeline records the sequence.
    activity = client.get(f"/api/v1/cases/{cid}/activity", headers=hdr).json()
    event_types = {e["event_type"] for e in activity}
    assert "document.uploaded" in event_types
    assert "comparison.completed" in event_types

    # Comparison view exposes ordered / received / invoiced per line.
    comp = client.get(f"/api/v1/cases/{cid}/comparison", headers=hdr).json()
    line = comp["lines"][0]
    assert (line["ordered"], line["received"], line["invoiced"]) == ("50", "40", "50")

    # Overview metrics are derived from real records (exposure = 10 x 12.00).
    ov = client.get(f"/api/v1/workspaces/{ids['ws_a']}/overview?days=30", headers=hdr).json()
    assert ov["metrics"]["open_cases"] == 1
    assert {"currency": "USD", "amount": "120.00"} in ov["metrics"]["exposure"]
    assert len(ov["series"]) == 30

    summary = client.get(f"/api/v1/cases/{cid}/summary", headers=hdr).json()
    assert summary["analyzed"] is True
    assert summary["exposure"] == [{"currency": "USD", "amount": "120.00"}]
    assert "Hold the invoice" in summary["recommended_next_step"]

    sups = client.get(f"/api/v1/workspaces/{ids['ws_a']}/suppliers", headers=hdr).json()
    assert sups[0]["name"] == "Northstar"
    assert sups[0]["exposure"] == [{"currency": "USD", "amount": "120.00"}]

    members = client.get(f"/api/v1/workspaces/{ids['ws_a']}/members", headers=hdr).json()
    assert {m["role"] for m in members} == {"admin", "contributor"}


def test_resolve_is_controlled_and_audited(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    contrib = _login(client, "contrib_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=admin, json={"title": "C", "currency": "USD"}
    ).json()

    # Draft cases can't jump straight to resolved.
    r = client.post(f"/api/v1/cases/{case['id']}/resolve", headers=admin, json={})
    assert r.status_code == 409

    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)
    # Contributors cannot resolve.
    assert client.post(f"/api/v1/cases/{case['id']}/resolve", headers=contrib, json={}).status_code == 403

    r = client.post(f"/api/v1/cases/{case['id']}/resolve", headers=admin, json={"comment": "Checked"})
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    events = client.get(f"/api/v1/cases/{case['id']}/activity", headers=admin).json()
    transitions = [e["payload"] for e in events if e["event_type"] == "case.status_changed"]
    assert {"from": "needs_review", "to": "resolved"} in transitions
    assert all(e["actor_name"] for e in events if e["actor_type"] == "user")


def test_settings_reports_real_integration_state(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "contrib_a@test.io")
    s = client.get(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=hdr).json()
    assert s["your_role"] == "contributor"
    assert s["email_configured"] is False
    assert s["approval_required"] is True
    # Non-members get 404, not the settings.
    other = _login(client, "admin_b@test.io")
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=other).status_code == 404


def test_document_removal_only_before_analysis(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}
    ).json()
    content = ("__OPSWARDEN_JSON__" + json.dumps({"document_type": "invoice", "line_items": []})).encode()

    def upload():
        r = client.post(
            f"/api/v1/cases/{case['id']}/documents",
            headers=hdr,
            files={"file": ("inv.json", content, "application/json")},
            data={"document_type": "invoice"},
        )
        return r.json()["document_id"]

    first = upload()
    assert client.delete(f"/api/v1/documents/{first}", headers=hdr).status_code == 204
    assert client.get(f"/api/v1/cases/{case['id']}/documents", headers=hdr).json() == []

    second = upload()
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=hdr)
    r = client.delete(f"/api/v1/documents/{second}", headers=hdr)
    assert r.status_code == 409

    # Non-members can't see or delete it.
    other = _login(client, "admin_b@test.io")
    assert client.delete(f"/api/v1/documents/{second}", headers=other).status_code == 404


def test_upload_rejects_spoofed_and_oversized_files(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}
    ).json()
    # .pdf extension without a PDF signature
    r = client.post(
        f"/api/v1/cases/{case['id']}/documents",
        headers=hdr,
        files={"file": ("fake.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")},
        data={"document_type": "invoice"},
    )
    assert r.status_code == 415
    r = client.post(
        f"/api/v1/cases/{case['id']}/documents",
        headers=hdr,
        files={"file": ("macro.exe", b"MZ\x90\x00", "application/octet-stream")},
        data={"document_type": "invoice"},
    )
    assert r.status_code == 415
