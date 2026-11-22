---
inclusion: fileMatch
fileMatchPattern: ["backend/**/*.py", "frontend/**/*.ts", "frontend/**/*.tsx"]
---
# Coding standards

## Python (backend)
- Python 3.12+ typing with `from __future__ import annotations`. Pydantic v2 schemas in `app/schemas/*` for every request and response.
- Money and quantities: `Decimal` end to end; parse with `normalization.parse_decimal`; serialise as strings. Never `float` for amounts.
- Errors: raise `ApiError` / `not_found` / `conflict` / `unprocessable` with a stable `CODE` and a plain-language message. Never return stack traces.
- Audit every state change with `audit_service.record_event(..., commit=False)` and commit once at the end of the handler.
- Tests: pytest in `backend/tests`, one file per area. Add a Hypothesis property test when a rule has an invariant (see `test_properties.py`). Tests must never reach real providers (see `conftest.py`).

## TypeScript (frontend)
- Strict TypeScript; `npm run typecheck` must pass. Types for API payloads live in `lib/types.ts` and mirror the Pydantic schemas.
- Data fetching only through RTK Query hooks from `store/api.ts`.
- Every screen handles loading, empty, error and permission-denied states.
- Accessibility: labelled controls, keyboard support for custom widgets, visible focus, no colour-only meaning.
- Pure logic that can be unit-tested goes in `lib/*.ts` with a `tests/*.test.ts` (node:test).

## General
- Small, reversible changes. Follow existing patterns before inventing new ones.
- No emoji outside Markdown files. YAML files end with exactly one newline.
