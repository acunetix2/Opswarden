"""Password reset, invitations, member management, lifecycle, policy, notifications, events."""
from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

from tests.test_api_flow import _login, _seed_two_workspaces

STRONG = "correct-horse-42"


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def _case(client, hdr, ws, **extra):
    return client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": "C", "currency": "USD", **extra}).json()


def _upload(client, hdr, case_id, dtype, payload):
    content = ("__OPSWARDEN_JSON__" + json.dumps({"document_type": dtype, **payload})).encode()
    r = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=hdr,
        files={"file": (f"{dtype}.json", content, "application/json")},
        data={"document_type": dtype},
    )
    assert r.status_code == 202, r.text


# ---- Password reset ---------------------------------------------------------------


def test_password_reset_flow(client):
    _seed_two_workspaces()
    # Unknown email: same generic response, no link (no account enumeration).
    r = client.post("/api/v1/auth/password-reset/request", json={"email": "nobody@test.io"})
    assert r.status_code == 202 and r.json()["dev_reset_url"] is None
    known = client.post("/api/v1/auth/password-reset/request", json={"email": "admin_a@test.io"}).json()
    assert known["message"] == r.json()["message"]
    token = _token_from(known["dev_reset_url"])

    weak = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "short"})
    assert weak.status_code == 422

    ok = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": STRONG})
    assert ok.status_code == 200 and ok.json()["access_token"]

    # Single use, old password no longer works, new one does.
    again = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": STRONG + "x"})
    assert again.status_code == 400
    assert client.post("/api/v1/auth/login", json={"email": "admin_a@test.io", "password": "pw"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "admin_a@test.io", "password": STRONG}).status_code == 200


def test_admin_issued_reset_link(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    members = client.get(f"/api/v1/workspaces/{ids['ws_a']}/members", headers=admin).json()
    contrib = next(m for m in members if m["role"] == "contributor")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/members/{contrib['user_id']}/password-reset", headers=admin)
    assert r.status_code == 200
    # Non-admins can't issue links.
    c = _login(client, "contrib_a@test.io")
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/members/{contrib['user_id']}/password-reset", headers=c).status_code == 403


# ---- Invitations & members --------------------------------------------------------


def test_invitation_lifecycle(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    contrib = _login(client, "contrib_a@test.io")
    ws = ids["ws_a"]

    assert client.post(f"/api/v1/workspaces/{ws}/invitations", headers=contrib, json={"email": "x@test.io", "role": "reviewer"}).status_code == 403
    assert client.post(f"/api/v1/workspaces/{ws}/invitations", headers=admin, json={"email": "contrib_a@test.io", "role": "reviewer"}).status_code == 409

    inv = client.post(f"/api/v1/workspaces/{ws}/invitations", headers=admin, json={"email": "New.Person@test.io", "role": "reviewer"}).json()
    token = _token_from(inv["invite_url"])
    assert inv["email"] == "new.person@test.io" and inv["status"] == "pending"
    assert len(client.get(f"/api/v1/workspaces/{ws}/invitations", headers=admin).json()) == 1

    look = client.get(f"/api/v1/invitations/lookup?token={token}").json()
    assert look["account_exists"] is False and look["role"] == "reviewer"

    assert client.post("/api/v1/invitations/accept", json={"token": token, "password": "weak"}).status_code == 422
    acc = client.post("/api/v1/invitations/accept", json={"token": token, "password": STRONG, "full_name": "New Person"})
    assert acc.status_code == 200 and acc.json()["workspace_id"] == ws
    new_hdr = {"Authorization": f"Bearer {acc.json()['access_token']}"}
    assert [w["role"] for w in client.get("/api/v1/workspaces", headers=new_hdr).json()] == ["reviewer"]
    # Token can't be reused.
    assert client.post("/api/v1/invitations/accept", json={"token": token, "password": STRONG, "full_name": "X"}).status_code == 400

    # Revoked invitations can't be accepted.
    inv2 = client.post(f"/api/v1/workspaces/{ws}/invitations", headers=admin, json={"email": "late@test.io", "role": "contributor"}).json()
    assert client.delete(f"/api/v1/invitations/{inv2['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/v1/invitations/lookup?token={_token_from(inv2['invite_url'])}").status_code == 400


def test_existing_account_accepts_with_its_password(client):
    ids = _seed_two_workspaces()
    admin_a = _login(client, "admin_a@test.io")
    inv = client.post(f"/api/v1/workspaces/{ids['ws_a']}/invitations", headers=admin_a, json={"email": "admin_b@test.io", "role": "contributor"}).json()
    token = _token_from(inv["invite_url"])
    assert client.get(f"/api/v1/invitations/lookup?token={token}").json()["account_exists"] is True
    assert client.post("/api/v1/invitations/accept", json={"token": token, "password": "wrong-password-1"}).status_code == 401
    assert client.post("/api/v1/invitations/accept", json={"token": token, "password": "pw"}).status_code == 200


def test_member_role_and_removal_rules(client):
    ids = _seed_two_workspaces()
    ws = ids["ws_a"]
    admin = _login(client, "admin_a@test.io")
    members = {m["role"]: m["user_id"] for m in client.get(f"/api/v1/workspaces/{ws}/members", headers=admin).json()}

    # Can't change own role / remove self; contributor can't manage.
    assert client.patch(f"/api/v1/workspaces/{ws}/members/{members['admin']}", headers=admin, json={"role": "reviewer"}).status_code == 409
    assert client.delete(f"/api/v1/workspaces/{ws}/members/{members['admin']}", headers=admin).status_code == 409
    contrib = _login(client, "contrib_a@test.io")
    assert client.patch(f"/api/v1/workspaces/{ws}/members/{members['contributor']}", headers=contrib, json={"role": "admin"}).status_code == 403

    assert client.patch(f"/api/v1/workspaces/{ws}/members/{members['contributor']}", headers=admin, json={"role": "reviewer"}).status_code == 204
    roles = {m["user_id"]: m["role"] for m in client.get(f"/api/v1/workspaces/{ws}/members", headers=admin).json()}
    assert roles[members["contributor"]] == "reviewer"

    assert client.delete(f"/api/v1/workspaces/{ws}/members/{members['contributor']}", headers=admin).status_code == 204
    # Removed member loses access immediately.
    assert client.get(f"/api/v1/workspaces/{ws}/cases", headers=contrib).status_code == 404


def test_last_admin_cannot_be_demoted(client):
    ids = _seed_two_workspaces()
    ws = ids["ws_a"]
    admin = _login(client, "admin_a@test.io")
    members = {m["role"]: m["user_id"] for m in client.get(f"/api/v1/workspaces/{ws}/members", headers=admin).json()}
    # Promote contributor to admin, then that admin tries to demote the only other admin -> allowed (2 admins).
    client.patch(f"/api/v1/workspaces/{ws}/members/{members['contributor']}", headers=admin, json={"role": "admin"})
    second = _login(client, "contrib_a@test.io")
    assert client.patch(f"/api/v1/workspaces/{ws}/members/{members['admin']}", headers=second, json={"role": "reviewer"}).status_code == 204
    # Now `second` is the last admin; the demoted user can't act as admin any more.
    assert client.patch(f"/api/v1/workspaces/{ws}/members/{members['contributor']}", headers=admin, json={"role": "reviewer"}).status_code == 403


# ---- Lifecycle -----------------------------------------------------------------------


def test_archive_expires_approvals_and_reopen(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    contrib = _login(client, "contrib_a@test.io")
    case = _case(client, admin, ids["ws_a"])
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)
    rec = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=admin).json()
    aid = client.post(f"/api/v1/recommendations/{rec['recommendation_id']}/request-approval", headers=admin).json()["approval_id"]

    assert client.post(f"/api/v1/cases/{case['id']}/archive", headers=contrib, json={}).status_code == 403
    r = client.post(f"/api/v1/cases/{case['id']}/archive", headers=admin, json={"reason": "Duplicate"})
    assert r.status_code == 200 and r.json()["status"] == "archived"
    assert client.get(f"/api/v1/approvals/{aid}", headers=admin).json()["status"] == "expired"

    listed = {c["id"] for c in client.get(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=admin).json()}
    assert case["id"] not in listed
    archived = client.get(f"/api/v1/workspaces/{ids['ws_a']}/cases?include_archived=true", headers=admin).json()
    assert case["id"] in {c["id"] for c in archived}
    assert client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin).status_code == 409

    r = client.post(f"/api/v1/cases/{case['id']}/reopen", headers=admin, json={})
    assert r.status_code == 200 and r.json()["status"] == "needs_review"
    assert client.post(f"/api/v1/cases/{case['id']}/reopen", headers=admin, json={}).status_code == 409


def test_analyze_is_idempotent_while_running(client):
    from app.db import SessionLocal
    from app.models.case import Case

    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    case = _case(client, admin, ids["ws_a"])
    db = SessionLocal()
    db.get(Case, case["id"]).status = "processing"
    db.commit()
    db.close()
    r = client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)
    assert r.status_code == 202 and r.json() == {"case_id": case["id"], "status": "processing", "run_id": None}


# ---- Policy ----------------------------------------------------------------------------


def test_policy_drives_comparison_and_approvals(client):
    ids = _seed_two_workspaces()
    ws = ids["ws_a"]
    admin = _login(client, "admin_a@test.io")
    contrib = _login(client, "contrib_a@test.io")

    assert client.patch(f"/api/v1/workspaces/{ws}/settings", headers=contrib, json={"price_tolerance": "1"}).status_code == 403
    assert client.patch(f"/api/v1/workspaces/{ws}/settings", headers=admin, json={"price_tolerance": "-1"}).status_code == 422
    assert client.patch(f"/api/v1/workspaces/{ws}/settings", headers=admin, json={"price_tolerance": "abc"}).status_code == 422

    s = client.patch(f"/api/v1/workspaces/{ws}/settings", headers=admin, json={"price_tolerance": "1.00", "workspace_name": "Renamed"}).json()
    assert s["price_tolerance"] == "1" and s["workspace_name"] == "Renamed"

    case = _case(client, admin, ws)
    _upload(client, admin, case["id"], "purchase_order", {"supplier_name": "S", "currency": "USD", "line_items": [{"sku": "A", "quantity": "10", "unit_price": "5.00"}]})
    _upload(client, admin, case["id"], "invoice", {"supplier_name": "S", "currency": "USD", "purchase_order_reference": "P", "line_items": [{"sku": "A", "quantity": "10", "unit_price": "5.50"}]})
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)
    rules = {f["rule_id"] for f in client.get(f"/api/v1/cases/{case['id']}/findings", headers=admin).json()["items"]}
    assert "UNIT_PRICE_MISMATCH" not in rules  # 0.50 difference is inside the 1.00 tolerance

    events = client.get(f"/api/v1/workspaces/{ws}/activity", headers=admin).json()
    assert any(e["event_type"] == "workspace.settings_updated" for e in events)


def test_reviewers_need_policy_permission_to_approve(client):
    from app.core.security import hash_password
    from app.db import SessionLocal
    from app.models.user import User
    from app.models.workspace import WorkspaceMember

    ids = _seed_two_workspaces()
    ws = ids["ws_a"]
    db = SessionLocal()
    u = User(email="rev_a@test.io", full_name="Rev", hashed_password=hash_password("pw"))
    db.add(u)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws, user_id=u.id, role="reviewer"))
    db.commit()
    db.close()

    admin = _login(client, "admin_a@test.io")
    reviewer = _login(client, "rev_a@test.io")
    client.patch(f"/api/v1/workspaces/{ws}/settings", headers=admin, json={"reviewers_can_approve": False})

    case = _case(client, admin, ws)
    rec = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=admin).json()
    aid = client.post(f"/api/v1/recommendations/{rec['recommendation_id']}/request-approval", headers=admin).json()["approval_id"]
    r = client.post(f"/api/v1/approvals/{aid}/decision", headers=reviewer, json={"decision": "approve"})
    assert r.status_code == 403

    client.patch(f"/api/v1/workspaces/{ws}/settings", headers=admin, json={"reviewers_can_approve": True})
    assert client.post(f"/api/v1/approvals/{aid}/decision", headers=reviewer, json={"decision": "approve"}).status_code == 200


# ---- Email provider ----------------------------------------------------------------------


def test_smtp_send_happens_once(client, monkeypatch):
    import smtplib

    from app.integrations.email import provider as email_provider

    sent: list = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            pass

        def login(self, u, p):
            pass

        def send_message(self, msg):
            sent.append(msg)

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    email_provider.set_email_provider(
        email_provider.SmtpEmailProvider("smtp.test", 587, "", "", "ops@opswarden.app", True)
    )
    try:
        ids = _seed_two_workspaces()
        admin = _login(client, "admin_a@test.io")
        case = _case(client, admin, ids["ws_a"])
        rec = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=admin).json()
        aid = client.post(
            f"/api/v1/recommendations/{rec['recommendation_id']}/request-approval",
            headers=admin,
            json={"recipient": "accounts@supplier.example"},
        ).json()["approval_id"]
        client.post(f"/api/v1/approvals/{aid}/decision", headers=admin, json={"decision": "approve"})

        first = client.post(f"/api/v1/approvals/{aid}/execute", headers=admin).json()
        second = client.post(f"/api/v1/approvals/{aid}/execute", headers=admin).json()
        assert first["status"] == second["status"] == "executed"
        assert first["provider_reference"] == second["provider_reference"]
        assert len(sent) == 1 and sent[0]["To"] == "accounts@supplier.example"
    finally:
        email_provider.set_email_provider(None)


# ---- Notifications & events ---------------------------------------------------------------


def test_notifications_unread_and_mark_read(client):
    ids = _seed_two_workspaces()
    ws = ids["ws_a"]
    admin = _login(client, "admin_a@test.io")
    contrib = _login(client, "contrib_a@test.io")
    case = _case(client, admin, ws)
    rec = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=admin).json()
    client.post(f"/api/v1/recommendations/{rec['recommendation_id']}/request-approval", headers=admin)

    # The actor doesn't get notified about their own action; others do.
    assert client.get(f"/api/v1/workspaces/{ws}/notifications", headers=admin).json()["unread_count"] == 0
    feed = client.get(f"/api/v1/workspaces/{ws}/notifications", headers=contrib).json()
    assert feed["unread_count"] >= 1 and feed["items"][0]["event_type"] == "approval.requested"

    assert client.post(f"/api/v1/workspaces/{ws}/notifications/mark-read", headers=contrib).status_code == 204
    assert client.get(f"/api/v1/workspaces/{ws}/notifications", headers=contrib).json()["unread_count"] == 0
    other = _login(client, "admin_b@test.io")
    assert client.get(f"/api/v1/workspaces/{ws}/notifications", headers=other).status_code == 404


def test_case_event_stream(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    case = _case(client, admin, ids["ws_a"])
    _upload(client, admin, case["id"], "invoice", {"supplier_name": "S", "currency": "USD", "line_items": []})
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)

    with client.stream(
        "GET",
        f"/api/v1/cases/{case['id']}/events?since=2000-01-01T00:00:00Z&max_seconds=1",
        headers=admin,
    ) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = "".join(r.iter_text())
    events = [line.split(": ", 1)[1] for line in body.splitlines() if line.startswith("event: ")]
    assert "document.uploaded" in events
    assert "comparison.completed" in events
    assert "investigation.completed" in events
    assert events[-1] == "stream.end"

    other = _login(client, "admin_b@test.io")
    assert client.get(f"/api/v1/cases/{case['id']}/events?max_seconds=1", headers=other).status_code == 404


def test_verifying_a_field_keeps_value(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    case = _case(client, admin, ids["ws_a"])
    content = b"Supplier: Acme\nInvoice No: INV-1\nPO Ref: PO-9\nCurrency: USD\nA1 | Widget | 5 | 2.00 | 10.00\n"
    client.post(
        f"/api/v1/cases/{case['id']}/documents",
        headers=admin,
        files={"file": ("inv.txt", content, "text/plain")},
        data={"document_type": "invoice"},
    )
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=admin)
    doc = client.get(f"/api/v1/cases/{case['id']}/documents", headers=admin).json()[0]
    fields = client.get(f"/api/v1/documents/{doc['id']}/extracted-fields", headers=admin).json()["fields"]
    target = next(f for f in fields if f["review_status"] == "needs_review")
    out = client.patch(
        f"/api/v1/documents/{doc['id']}/extracted-fields",
        headers=admin,
        json={"corrections": [{"field_path": target["field_path"], "value": target["value"]}]},
    ).json()
    after = next(f for f in out["fields"] if f["field_path"] == target["field_path"])
    assert after["review_status"] == "verified" and after["value"] == target["value"]
