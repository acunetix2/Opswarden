"""Supabase Auth mode: token verification, user mapping by email, invitation claim, local endpoints disabled.

Uses the legacy HS256 shared-secret path so no network (JWKS) is needed.
"""

from __future__ import annotations

import time

import jwt
import pytest

from tests.test_api_flow import _login, _seed_two_workspaces

SUPABASE_URL = "https://testproj.supabase.co"
SECRET = "super-secret-jwt-key-for-tests-only-0123456789"


def _token(email: str, *, aud: str = "authenticated", iss: str | None = None, exp_in: int = 3600, secret: str = SECRET) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": f"sb-{email}",
            "email": email,
            "aud": aud,
            "iss": iss or f"{SUPABASE_URL}/auth/v1",
            "iat": now,
            "exp": now + exp_in,
            "user_metadata": {"full_name": "Sam Supabase"},
        },
        secret,
        algorithm="HS256",
    )


@pytest.fixture()
def supabase_mode(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_provider", "supabase")
    monkeypatch.setattr(settings, "supabase_url", SUPABASE_URL)
    monkeypatch.setattr(settings, "supabase_jwt_secret", SECRET)
    yield settings


def test_auth_config_reports_provider(client, supabase_mode):
    assert client.get("/api/v1/auth/config").json() == {"provider": "supabase"}


def test_valid_token_maps_existing_user_by_email(client, supabase_mode):
    ids = _seed_two_workspaces()
    hdr = {"Authorization": f"Bearer {_token('ADMIN_A@test.io')}"}
    me = client.get("/api/v1/auth/me", headers=hdr)
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "admin_a@test.io"
    ws = client.get("/api/v1/workspaces", headers=hdr).json()
    assert [w["id"] for w in ws] == [ids["ws_a"]]


def test_new_supabase_user_gets_account_without_access(client, supabase_mode):
    _seed_two_workspaces()
    hdr = {"Authorization": f"Bearer {_token('newbie@test.io')}"}
    me = client.get("/api/v1/auth/me", headers=hdr)
    assert me.status_code == 200
    assert me.json()["full_name"] == "Sam Supabase"
    assert client.get("/api/v1/workspaces", headers=hdr).json() == []


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"secret": "wrong-secret-wrong-secret-wrong-secret"},
        {"aud": "anon"},
        {"iss": "https://evil.example.com/auth/v1"},
        {"exp_in": -10},
    ],
)
def test_bad_tokens_are_rejected(client, supabase_mode, token_kwargs):
    _seed_two_workspaces()
    hdr = {"Authorization": f"Bearer {_token('admin_a@test.io', **token_kwargs)}"}
    assert client.get("/api/v1/auth/me", headers=hdr).status_code == 401


def test_local_password_endpoints_disabled(client, supabase_mode):
    _seed_two_workspaces()
    r = client.post("/api/v1/auth/login", json={"email": "admin_a@test.io", "password": "pw"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "AUTH_EXTERNAL"


def test_invitation_claim_requires_matching_email(client, monkeypatch):
    from app.core.config import settings

    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")  # create the invite in local mode
    inv = client.post(f"/api/v1/workspaces/{ids['ws_a']}/invitations", headers=admin, json={"email": "invitee@test.io", "role": "reviewer"})
    assert inv.status_code == 201, inv.text
    token = inv.json()["invite_url"].split("token=")[1]

    monkeypatch.setattr(settings, "auth_provider", "supabase")
    monkeypatch.setattr(settings, "supabase_url", SUPABASE_URL)
    monkeypatch.setattr(settings, "supabase_jwt_secret", SECRET)

    wrong = {"Authorization": f"Bearer {_token('someone-else@test.io')}"}
    assert client.post("/api/v1/invitations/claim", headers=wrong, json={"token": token}).status_code == 403

    right = {"Authorization": f"Bearer {_token('invitee@test.io')}"}
    r = client.post("/api/v1/invitations/claim", headers=right, json={"token": token})
    assert r.status_code == 200, r.text
    assert r.json()["workspace_id"] == ids["ws_a"]
    ws = client.get("/api/v1/workspaces", headers=right).json()
    assert ws[0]["role"] == "reviewer"
    # One-time: claiming again fails.
    assert client.post("/api/v1/invitations/claim", headers=right, json={"token": token}).status_code == 400
