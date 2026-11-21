"""Help assistant endpoint: membership check and builtin fallback without a model."""

from __future__ import annotations

from tests.test_api_flow import _login, _seed_two_workspaces


def test_assistant_falls_back_when_no_model(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "contrib_a@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat", headers=hdr, json={"message": "How do I approve?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] is None
    assert body["source"] == "builtin"


def test_assistant_is_workspace_scoped(client):
    ids = _seed_two_workspaces()
    hdr_b = _login(client, "admin_b@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat", headers=hdr_b, json={"message": "hi"})
    assert r.status_code == 404


def test_assistant_rejects_empty_and_oversized_messages(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    url = f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat"
    assert client.post(url, headers=hdr, json={"message": ""}).status_code == 422
    assert client.post(url, headers=hdr, json={"message": "x" * 1001}).status_code == 422
