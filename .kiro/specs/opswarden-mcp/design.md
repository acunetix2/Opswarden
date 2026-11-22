# Design: OpsWarden MCP server

- `backend/mcp_server/opswarden_mcp.py`, standard library + `httpx` only, so it runs from the backend virtualenv with no new dependency.
- `Api` class: lazily signs in (`POST /auth/login`) or uses a token, picks the workspace (`OPSWARDEN_WORKSPACE` name or the first), and wraps GET calls.
- `handle(message, api)` is a pure dispatcher (testable without stdio). `main()` loops over stdin lines and writes responses to stdout; logs go to stderr only.
- Tools: `get_overview`, `list_cases`, `get_case`, `search`, `list_pending_approvals`, `list_purchase_orders`. Each returns a compact JSON text content block.
- Registered in `.kiro/settings/mcp.json` with `${OPSWARDEN_*}` placeholders and the read-only tools auto-approved.

Testing: `backend/tests/test_mcp_server.py` drives `handle` with a fake API: initialize, tools/list (no write tools), tools/call results, unknown method and bad arguments.
