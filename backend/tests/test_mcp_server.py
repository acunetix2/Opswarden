"""OpsWarden MCP server: protocol handling, read-only tool surface, and calls through the real API."""
from __future__ import annotations

import json

from mcp_server import opswarden_mcp as mcp
from tests.test_api_flow import _seed_two_workspaces


def _rpc(method, params=None, msg_id=1):
    msg = {"jsonrpc": "2.0", "id": msg_id, "method": method}
    if params is not None:
        msg["params"] = params
    return msg


class _NoApi(mcp.Api):
    def get(self, path, params=None):  # pragma: no cover - must not be reached
        raise AssertionError("no API call expected")


def test_initialize_ping_and_unknown_method():
    api = _NoApi(env={})
    init = mcp.handle(_rpc("initialize", {"protocolVersion": "2024-11-05"}), api)
    assert init["result"]["serverInfo"]["name"] == "opswarden"
    assert "tools" in init["result"]["capabilities"]
    assert mcp.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}, api) is None
    assert mcp.handle(_rpc("ping"), api)["result"] == {}
    assert mcp.handle(_rpc("resources/write"), api)["error"]["code"] == -32601
    assert mcp.handle({"id": 3, "method": "ping"}, api)["error"]["code"] == -32600


def test_tool_list_is_read_only():
    tools = mcp.handle(_rpc("tools/list"), _NoApi(env={}))["result"]["tools"]
    names = {t["name"] for t in tools}
    assert names == {"get_overview", "list_cases", "get_case", "search", "list_pending_approvals", "list_purchase_orders"}
    assert all(t["annotations"]["readOnlyHint"] for t in tools)
    for word in ("approve", "send", "delete", "update", "create", "resolve", "analyze"):
        assert not any(word in n for n in names)


def test_bad_tool_calls_are_errors_not_crashes():
    api = _NoApi(env={})
    assert mcp.handle(_rpc("tools/call", {"name": "send_email", "arguments": {}}), api)["error"]["code"] == -32602
    assert mcp.handle(_rpc("tools/call", {"name": "search", "arguments": []}), api)["error"]["code"] == -32602
    r = mcp.handle(_rpc("tools/call", {"name": "search", "arguments": {"query": " "}}), api)["result"]
    assert r["isError"] is True


def test_missing_configuration_gives_plain_messages():
    r = mcp.handle(_rpc("tools/call", {"name": "list_cases", "arguments": {}}), mcp.Api(env={}))["result"]
    assert r["isError"] and "OPSWARDEN_API_URL" in r["content"][0]["text"]
    r = mcp.handle(
        _rpc("tools/call", {"name": "list_cases", "arguments": {}}),
        mcp.Api(env={"OPSWARDEN_API_URL": "http://testserver"}),
    )["result"]
    assert r["isError"] and "OPSWARDEN_EMAIL" in r["content"][0]["text"]


def _call(api, name, args=None):
    out = mcp.handle(_rpc("tools/call", {"name": name, "arguments": args or {}}), api)["result"]
    assert out["isError"] is False, out
    return json.loads(out["content"][0]["text"])


def test_tools_go_through_the_api_with_the_users_permissions(client):
    ids = _seed_two_workspaces()
    env = {"OPSWARDEN_API_URL": "http://testserver", "OPSWARDEN_EMAIL": "admin_a@test.io", "OPSWARDEN_PASSWORD": "pw"}
    api = mcp.Api(env=env, client=client)

    from tests.test_api_flow import _login
    hdr = _login(client, "admin_a@test.io")
    created = client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr,
        json={"title": "Bolts short-shipped", "currency": "USD", "supplier_name": "Acme Fasteners"},
    ).json()

    overview = _call(api, "get_overview", {"days": 7})
    assert overview["workspace"] == "A" and overview["metrics"]["open_cases"] == 1

    cases = _call(api, "list_cases", {"search": "Bolts"})
    assert [c["case_number"] for c in cases] == [created["case_number"]]

    detail = _call(api, "get_case", {"case": created["case_number"]})
    assert detail["case"]["id"] == created["id"] and detail["findings"] == []

    assert _call(api, "list_pending_approvals") == []
    assert _call(api, "list_purchase_orders") == []
    hits = _call(api, "search", {"query": "Acme"})["hits"]
    assert any(h["kind"] == "case" and h["id"] == created["id"] for h in hits)

    # Another workspace's member can't read this case through MCP either.
    other = mcp.Api(env={**env, "OPSWARDEN_EMAIL": "admin_b@test.io"}, client=client)
    r = mcp.handle(_rpc("tools/call", {"name": "get_case", "arguments": {"case": created["id"]}}), other)["result"]
    assert r["isError"] and "access" in r["content"][0]["text"]


def test_wrong_password_never_echoes_credentials(client):
    _seed_two_workspaces()
    env = {"OPSWARDEN_API_URL": "http://testserver", "OPSWARDEN_EMAIL": "admin_a@test.io", "OPSWARDEN_PASSWORD": "hunter2-wrong"}
    r = mcp.handle(_rpc("tools/call", {"name": "list_cases", "arguments": {}}), mcp.Api(env=env, client=client))["result"]
    assert r["isError"]
    assert "hunter2" not in r["content"][0]["text"]
