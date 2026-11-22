# Requirements: OpsWarden MCP server

## Introduction
Expose OpsWarden's investigation data to MCP clients (Kiro, other agents) so a developer or analyst can ask about cases, findings and approvals from their editor. The server is read-only.

## Requirement 1: Protocol
1.1 THE SYSTEM SHALL speak MCP over stdio (JSON-RPC 2.0, one message per line) and answer `initialize`, `tools/list`, `tools/call` and `ping`.
1.2 WHEN a request has an unknown method THE SYSTEM SHALL return JSON-RPC error -32601; malformed JSON SHALL return -32700.

## Requirement 2: Tools (read-only)
2.1 THE SYSTEM SHALL provide tools to get the overview, list cases (optional status and search), get one case with findings and summary, search the workspace, list pending approvals, and list purchase orders.
2.2 THE SYSTEM SHALL NOT expose any tool that changes data, sends email or approves anything.

## Requirement 3: Authentication
3.1 THE SYSTEM SHALL authenticate to the OpsWarden API using credentials from environment variables (`OPSWARDEN_API_URL`, and either `OPSWARDEN_TOKEN` or `OPSWARDEN_EMAIL` + `OPSWARDEN_PASSWORD`), never from the config file.
3.2 THE SYSTEM SHALL use the API's normal permission checks; it has no privileged access.
3.3 WHEN authentication fails THE SYSTEM SHALL return a tool error with a plain message and no credentials in it.
