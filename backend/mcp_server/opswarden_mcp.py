"""OpsWarden MCP server: read-only access to cases, findings and approvals.

Speaks the Model Context Protocol over stdio (JSON-RPC 2.0, one message per line).
It calls the normal OpsWarden HTTP API with the user's own credentials, so every
permission and tenant check still applies. No tool changes data, sends email or
approves anything.

Environment:
  OPSWARDEN_API_URL     e.g. https://opswarden.onrender.com (or http://127.0.0.1:8099)
  OPSWARDEN_TOKEN       a bearer token, or
  OPSWARDEN_EMAIL / OPSWARDEN_PASSWORD
  OPSWARDEN_WORKSPACE   optional workspace name; defaults to the first one

Run: python backend/mcp_server/opswarden_mcp.py
"""
from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable
from typing import Any

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "opswarden", "version": "1.0.0"}
_TIMEOUT_SECONDS = 60.0  # Render's free tier can take ~50s to wake up


class ToolError(Exception):
    """A tool failed in a way the user can act on. The message never contains credentials."""


class _Response:
    def __init__(self, status_code: int, body: bytes) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> Any:
        return json.loads(self._body.decode("utf-8") or "null")


class _UrllibClient:
    """Standard-library fallback with the two methods the Api class uses."""

    def _send(self, req: Any) -> _Response:
        import urllib.error
        import urllib.request

        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as r:  # noqa: S310 - URL comes from the user's env
                return _Response(r.status, r.read())
        except urllib.error.HTTPError as exc:
            return _Response(exc.code, exc.read())

    def get(self, url: str, params: dict | None = None, headers: dict | None = None) -> _Response:
        import urllib.parse
        import urllib.request

        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        return self._send(urllib.request.Request(url, headers=headers or {}, method="GET"))

    def post(self, url: str, json: Any = None, headers: dict | None = None) -> _Response:  # noqa: A002 - httpx signature
        import json as _json
        import urllib.request

        data = _json.dumps(json).encode("utf-8")
        hdrs = {"Content-Type": "application/json", **(headers or {})}
        return self._send(urllib.request.Request(url, data=data, headers=hdrs, method="POST"))


class Api:
    """Thin read-only client for the OpsWarden API."""

    def __init__(self, env: dict[str, str] | None = None, client: Any = None) -> None:
        env = dict(os.environ if env is None else env)
        self.base = (env.get("OPSWARDEN_API_URL") or "").rstrip("/")
        self._token = env.get("OPSWARDEN_TOKEN") or None
        self._email = env.get("OPSWARDEN_EMAIL") or None
        self._password = env.get("OPSWARDEN_PASSWORD") or None
        self._workspace_name = (env.get("OPSWARDEN_WORKSPACE") or "").strip().lower() or None
        self._workspace_id: str | None = None
        self._client = client

    # -- plumbing ---------------------------------------------------------------
    def _http(self) -> Any:
        if self._client is None:
            try:
                import httpx
            except ImportError:  # any Python 3 works; httpx is only a nicer client
                self._client = _UrllibClient()
            else:
                self._client = httpx.Client(timeout=_TIMEOUT_SECONDS)
        return self._client

    def _url(self, path: str) -> str:
        if not self.base:
            raise ToolError("Set OPSWARDEN_API_URL to the OpsWarden API address.")
        return f"{self.base}/api/v1{path}"

    def _sign_in(self) -> str:
        if self._token:
            return self._token
        if not (self._email and self._password):
            raise ToolError("Set OPSWARDEN_TOKEN, or OPSWARDEN_EMAIL and OPSWARDEN_PASSWORD.")
        r = self._http().post(self._url("/auth/login"), json={"email": self._email, "password": self._password})
        if r.status_code != 200:
            raise ToolError("Sign-in to OpsWarden failed. Check the email and password in your environment.")
        self._token = r.json()["access_token"]
        return self._token

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        r = self._http().get(self._url(path), params=clean, headers={"Authorization": f"Bearer {self._sign_in()}"})
        if r.status_code == 401:
            self._token = None
            raise ToolError("OpsWarden rejected the credentials. Sign in again or refresh the token.")
        if r.status_code == 404:
            raise ToolError("Not found, or you don't have access to it.")
        if r.status_code >= 400:
            try:
                message = r.json()["error"]["message"]
            except (ValueError, KeyError, TypeError):
                message = f"OpsWarden returned HTTP {r.status_code}."
            raise ToolError(message)
        return r.json()

    def workspace_id(self) -> str:
        if self._workspace_id:
            return self._workspace_id
        workspaces = self.get("/workspaces")
        if not workspaces:
            raise ToolError("This account isn't a member of any workspace.")
        chosen = workspaces[0]
        if self._workspace_name:
            matches = [w for w in workspaces if w["name"].strip().lower() == self._workspace_name]
            if not matches:
                raise ToolError("No workspace with that OPSWARDEN_WORKSPACE name for this account.")
            chosen = matches[0]
        self._workspace_id = chosen["id"]
        return self._workspace_id


# -- tools -------------------------------------------------------------------------
def _case_brief(c: dict) -> dict:
    return {
        "id": c["id"],
        "case_number": c["case_number"],
        "title": c["title"],
        "supplier": c.get("supplier_name"),
        "po_reference": c.get("supplier_reference"),
        "status": c["status"],
        "open_findings": c.get("finding_count", 0),
        "outcome": c.get("resolution_outcome"),
        "recovered_amount": c.get("recovered_amount"),
        "currency": c.get("currency"),
        "updated_at": c.get("updated_at"),
    }


def _resolve_case_id(api: Api, ref: str) -> str:
    """Accepts a case id or a case number like OW-2026-0001."""
    ref = ref.strip()
    if ref.upper().startswith("OW-"):
        cases = api.get(f"/workspaces/{api.workspace_id()}/cases", {"search": ref, "include_archived": "true", "limit": 50})
        for c in cases:
            if c["case_number"].upper() == ref.upper():
                return c["id"]
        raise ToolError(f"No case {ref.upper()} in this workspace.")
    return ref


def tool_get_overview(api: Api, args: dict) -> Any:
    days = int(args.get("days") or 30)
    data = api.get(f"/workspaces/{api.workspace_id()}/overview", {"days": max(1, min(days, 365))})
    return {
        "workspace": data["workspace_name"],
        "period_days": data["period_days"],
        "metrics": data["metrics"],
        "needs_attention": data["attention"][:10],
    }


def tool_list_cases(api: Api, args: dict) -> Any:
    params = {"status": args.get("status"), "search": args.get("search"), "limit": int(args.get("limit") or 25)}
    params["limit"] = max(1, min(params["limit"], 100))
    return [_case_brief(c) for c in api.get(f"/workspaces/{api.workspace_id()}/cases", params)]


def tool_get_case(api: Api, args: dict) -> Any:
    ref = str(args.get("case") or "").strip()
    if not ref:
        raise ToolError("Give a case number (OW-2026-0001) or case id.")
    case_id = _resolve_case_id(api, ref)
    case = api.get(f"/cases/{case_id}")
    summary = api.get(f"/cases/{case_id}/summary")
    findings = api.get(f"/cases/{case_id}/findings", {"limit": 100})
    items = findings.get("items", findings) if isinstance(findings, dict) else findings
    return {
        "case": _case_brief(case),
        "summary": summary,
        "findings": [
            {
                "rule": f.get("rule_id"),
                "severity": f.get("severity"),
                "status": f.get("status"),
                "title": f.get("title"),
                "description": f.get("description"),
                "expected": f.get("expected_value"),
                "observed": f.get("observed_value"),
                "impact": f.get("impact_amount"),
                "currency": f.get("currency"),
            }
            for f in items
        ],
    }


def tool_search(api: Api, args: dict) -> Any:
    q = str(args.get("query") or "").strip()
    if not q:
        raise ToolError("Give something to search for, such as a supplier, PO or invoice number.")
    return api.get(f"/workspaces/{api.workspace_id()}/search", {"q": q[:100]})


def tool_list_pending_approvals(api: Api, args: dict) -> Any:
    approvals = api.get(f"/workspaces/{api.workspace_id()}/approvals", {"status": "pending"})
    return [
        {
            "id": a.get("id"),
            "case_id": a.get("case_id"),
            "case_number": a.get("case_number"),
            "supplier": a.get("supplier_name"),
            "action": a.get("action_type"),
            "subject": a.get("subject"),
            "recipient": a.get("recipient"),
            "requested_by": a.get("requested_by_name"),
            "requested_at": a.get("created_at"),
        }
        for a in approvals
    ]


def tool_list_purchase_orders(api: Api, args: dict) -> Any:
    return api.get(f"/workspaces/{api.workspace_id()}/registry/purchase-orders", {"status": args.get("status")})


Tool = tuple[str, dict, Callable[[Api, dict], Any]]
TOOLS: dict[str, Tool] = {
    "get_overview": (
        "Workspace dashboard figures: open cases, findings, approvals waiting, value in dispute, value recovered.",
        {"type": "object", "properties": {"days": {"type": "integer", "minimum": 1, "maximum": 365}}},
        tool_get_overview,
    ),
    "list_cases": (
        "List cases, newest activity first. Filter by status (draft, needs_review, ready_for_approval, resolved...) or search text.",
        {
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "search": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
        },
        tool_list_cases,
    ),
    "get_case": (
        "One case with its summary and every finding (rule, expected vs observed, impact).",
        {
            "type": "object",
            "properties": {"case": {"type": "string", "description": "Case number like OW-2026-0001, or the case id"}},
            "required": ["case"],
        },
        tool_get_case,
    ),
    "search": (
        "Search cases, suppliers, purchase orders, findings and documents.",
        {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        tool_search,
    ),
    "list_pending_approvals": (
        "Supplier letters waiting for a reviewer's approval.",
        {"type": "object", "properties": {}},
        tool_list_pending_approvals,
    ),
    "list_purchase_orders": (
        "Purchase orders in the register.",
        {"type": "object", "properties": {"status": {"type": "string"}}},
        tool_list_purchase_orders,
    ),
}


# -- JSON-RPC -------------------------------------------------------------------------
def _result(msg_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def handle(message: Any, api: Api) -> dict | None:
    """Dispatch one JSON-RPC message. Returns the response, or None for notifications."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or "method" not in message:
        return _error(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid request")
    msg_id = message.get("id")
    method = message["method"]
    params = message.get("params") or {}
    is_notification = "id" not in message

    if method == "initialize":
        return _result(msg_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": "Read-only access to OpsWarden cases, findings and approvals. Nothing here changes data.",
        })
    if method.startswith("notifications/"):
        return None
    if method == "ping":
        return _result(msg_id, {})
    if method == "tools/list":
        return _result(msg_id, {
            "tools": [
                {"name": name, "description": desc, "inputSchema": schema, "annotations": {"readOnlyHint": True}}
                for name, (desc, schema, _fn) in TOOLS.items()
            ]
        })
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments")
        if args is None:
            args = {}
        if name not in TOOLS:
            return _error(msg_id, -32602, f"Unknown tool: {name}")
        if not isinstance(args, dict):
            return _error(msg_id, -32602, "Tool arguments must be an object")
        try:
            data = TOOLS[name][2](api, args)
        except ToolError as exc:
            return _result(msg_id, {"content": [{"type": "text", "text": str(exc)}], "isError": True})
        except (ValueError, TypeError):
            return _result(msg_id, {"content": [{"type": "text", "text": "Those arguments aren't valid for this tool."}], "isError": True})
        except Exception:  # network failures and the like; never echo internals
            return _result(msg_id, {"content": [{"type": "text", "text": "Couldn't reach OpsWarden. Check OPSWARDEN_API_URL and try again."}], "isError": True})
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return _result(msg_id, {"content": [{"type": "text", "text": text}], "isError": False})
    if is_notification:
        return None
    return _error(msg_id, -32601, f"Method not found: {method}")


def main() -> None:
    api = Api()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            response: dict | None = _error(None, -32700, "Parse error")
        else:
            response = handle(message, api)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
