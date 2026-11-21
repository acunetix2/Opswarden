"""Sign-up with an emailed one-time code: new account + new workspace, never access to someone else's."""
from __future__ import annotations

import pytest

from app.api.routes import auth as auth_routes
from app.core.config import settings
from tests.test_api_flow import _login, _seed_two_workspaces

GOOD = {"full_name": "Dana Buyer", "email": "Dana@Example.com", "password": "strong-pass-42", "workspace_name": "Dana Trading"}


@pytest.fixture(autouse=True)
def _reset_limits():
    auth_routes._signup_attempts.clear()
    auth_routes._reset_attempts.clear()
    yield
    auth_routes._signup_attempts.clear()
    auth_routes._reset_attempts.clear()


def _start(client, **overrides):
    return client.post("/api/v1/auth/signup/start", json={**GOOD, **overrides})


def _verify(client, vid, code):
    return client.post("/api/v1/auth/signup/verify", json={"verification_id": vid, "code": code})


def _wrong(code: str) -> str:
    return f"{(int(code) + 1) % 10**6:06d}"


def test_code_then_account_and_workspace(client):
    r = _start(client)
    assert r.status_code == 202, r.text
    start = r.json()
    assert start["email"] == "dana@example.com" and len(start["dev_code"]) == 6  # dev only: no email provider in tests

    # No account exists until the code is confirmed.
    assert client.post("/api/v1/auth/login", json={"email": "dana@example.com", "password": "strong-pass-42"}).status_code == 401

    done = _verify(client, start["verification_id"], start["dev_code"])
    assert done.status_code == 201, done.text
    hdr = {"Authorization": f"Bearer {done.json()['access_token']}"}
    assert client.get("/api/v1/workspaces", headers=hdr).json() == [
        {"id": done.json()["workspace_id"], "name": "Dana Trading", "role": "admin"}
    ]
    case = client.post(f"/api/v1/workspaces/{done.json()['workspace_id']}/cases", headers=hdr, json={"title": "First", "currency": "USD"})
    assert case.status_code == 201, case.text
    assert client.post("/api/v1/auth/login", json={"email": "dana@example.com", "password": "strong-pass-42"}).status_code == 200

    # The code works once.
    assert _verify(client, start["verification_id"], start["dev_code"]).json()["error"]["code"] == "CODE_INVALID"


def test_code_accepts_spaces_and_dashes(client):
    start = _start(client).json()
    c = start["dev_code"]
    assert _verify(client, start["verification_id"], f"{c[:3]} {c[3:]}").status_code == 201


def test_wrong_codes_are_limited(client):
    start = _start(client).json()
    vid, code = start["verification_id"], start["dev_code"]
    for left in range(settings.signup_code_max_attempts - 1, 0, -1):
        r = _verify(client, vid, _wrong(code))
        assert r.status_code == 400 and f"{left} tr" in r.json()["error"]["message"]
    assert _verify(client, vid, _wrong(code)).status_code == 429
    # Even the right code is refused now, until a new one is sent.
    assert _verify(client, vid, code).json()["error"]["code"] == "TOO_MANY_ATTEMPTS"


def test_resend_replaces_the_code_and_is_rate_limited(client, monkeypatch):
    start = _start(client).json()
    vid = start["verification_id"]
    assert client.post("/api/v1/auth/signup/resend", json={"verification_id": vid}).json()["error"]["code"] == "RESEND_TOO_SOON"

    monkeypatch.setattr(settings, "signup_code_resend_seconds", 0)
    again = client.post("/api/v1/auth/signup/resend", json={"verification_id": vid}).json()
    assert again["verification_id"] == vid
    if again["dev_code"] != start["dev_code"]:
        assert _verify(client, vid, start["dev_code"]).json()["error"]["code"] == "CODE_INCORRECT"
    assert _verify(client, vid, again["dev_code"]).status_code == 201


def test_expired_code_is_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "signup_code_ttl_minutes", -1)
    start = _start(client).json()
    assert _verify(client, start["verification_id"], start["dev_code"]).json()["error"]["code"] == "CODE_EXPIRED"


def test_starting_again_invalidates_the_earlier_code(client):
    first = _start(client).json()
    second = _start(client).json()
    assert _verify(client, first["verification_id"], first["dev_code"]).json()["error"]["code"] == "CODE_INVALID"
    assert _verify(client, second["verification_id"], second["dev_code"]).status_code == 201


def test_validation_and_existing_email(client):
    ids = _seed_two_workspaces()
    assert _start(client, email="admin_a@test.io").json()["error"]["code"] == "EMAIL_IN_USE"
    assert _start(client, password="short").json()["error"]["code"] == "WEAK_PASSWORD"
    assert _start(client, full_name="   ").status_code == 422
    assert _start(client, workspace_name="   ").status_code == 422
    assert _start(client, email="not-an-email").status_code == 422

    # A new account never sees existing workspaces.
    start = _start(client).json()
    hdr = {"Authorization": f"Bearer {_verify(client, start['verification_id'], start['dev_code']).json()['access_token']}"}
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr).status_code == 404


def test_code_is_not_stored_in_plain_text(client):
    from app.db import SessionLocal
    from app.models.access import SignupVerification

    start = _start(client).json()
    db = SessionLocal()
    try:
        row = db.get(SignupVerification, start["verification_id"])
        assert start["dev_code"] not in row.code_hash and len(row.code_hash) == 64
        assert row.hashed_password != GOOD["password"]
    finally:
        db.close()


def test_production_without_email_refuses_and_never_leaks_the_code(client, monkeypatch):
    monkeypatch.setattr(settings, "opswarden_env", "production")
    r = _start(client)
    assert r.status_code == 503 and r.json()["error"]["code"] == "EMAIL_NOT_CONFIGURED"
    assert "dev_code" not in r.text


def test_form_mistakes_do_not_use_up_the_email_limit(client):
    for _ in range(5):
        assert _start(client, password="short").status_code == 422
    assert _start(client).status_code == 202


def test_signup_can_be_turned_off(client, monkeypatch):
    monkeypatch.setattr(settings, "allow_signup", False)
    assert _start(client).json()["error"]["code"] == "SIGNUP_DISABLED"
    assert client.get("/api/v1/auth/config").json()["allow_signup"] is False


def test_signed_in_user_can_create_another_workspace(client):
    _seed_two_workspaces()
    hdr = _login(client, "contrib_a@test.io")
    r = client.post("/api/v1/workspaces", headers=hdr, json={"name": "Side project"})
    assert r.status_code == 201 and r.json()["role"] == "admin"
    roles = {w["name"]: w["role"] for w in client.get("/api/v1/workspaces", headers=hdr).json()}
    assert roles["Side project"] == "admin" and roles["A"] == "contributor"
    assert client.post("/api/v1/workspaces", json={"name": "x"}).status_code == 401
