"""Editing your own profile: name and password."""
from __future__ import annotations

import pytest

from app.api.routes import auth as auth_routes
from tests.test_api_flow import _login, _seed_two_workspaces


@pytest.fixture(autouse=True)
def _reset_limits():
    auth_routes._reset_attempts.clear()
    yield
    auth_routes._reset_attempts.clear()


def test_update_name_shows_everywhere(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    r = client.patch("/api/v1/auth/me", headers=hdr, json={"full_name": "  Avery   Stone "})
    assert r.status_code == 200 and r.json()["full_name"] == "Avery Stone"
    assert client.get("/api/v1/auth/me", headers=hdr).json()["full_name"] == "Avery Stone"
    members = client.get(f"/api/v1/workspaces/{ids['ws_a']}/members", headers=hdr).json()
    assert any(m["full_name"] == "Avery Stone" for m in members)
    assert client.patch("/api/v1/auth/me", headers=hdr, json={"full_name": "   "}).status_code == 422
    assert client.patch("/api/v1/auth/me", json={"full_name": "X"}).status_code == 401


def test_change_password(client):
    _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    url = "/api/v1/auth/me/password"
    wrong = client.post(url, headers=hdr, json={"current_password": "nope", "new_password": "fresh-pass-42"})
    assert wrong.json()["error"]["code"] == "CURRENT_PASSWORD_INCORRECT"
    weak = client.post(url, headers=hdr, json={"current_password": "pw", "new_password": "short"})
    assert weak.json()["error"]["code"] == "WEAK_PASSWORD"
    assert client.post(url, headers=hdr, json={"current_password": "pw", "new_password": "fresh-pass-42"}).status_code == 204
    assert client.post("/api/v1/auth/login", json={"email": "admin_a@test.io", "password": "pw"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "admin_a@test.io", "password": "fresh-pass-42"}).status_code == 200
