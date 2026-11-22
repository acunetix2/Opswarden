---
inclusion: auto
name: testing
description: How to test OpsWarden. Use when writing or running tests, adding a feature, or verifying a fix.
---
# Testing steering

- Backend: `cd backend && python -m pytest -q` (about 2 minutes). Focused: `python -m pytest -q tests/test_<area>.py`.
- Frontend: `cd frontend && npm run typecheck && npm test`.
- Live checks against running servers: `backend/smoke_test.py`, `backend/scripts/smoke_ai.py`, `backend/scripts/smoke_registry.py`, `backend/scripts/smoke_signup.py`.
- Property-based tests (Hypothesis) live in `backend/tests/test_properties.py`. Add one when a requirement states an invariant, e.g. "equal quantities never produce a quantity finding" or "an edited payload can't reuse an approval".
- A requirement is verified only by a test that asserts that requirement's own expected values. A green suite that doesn't assert it is not coverage.
- Before reporting done: run the focused tests for what changed, the typecheck, and the secret scan.
