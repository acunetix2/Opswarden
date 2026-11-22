# Tasks: Warden actions
- [x] 1. Extend the Warden system prompt with the action-line contract (`ACTION_CONTRACT` in `assistant.py`)
  - _Requirements: 1.1_
- [x] 2. Parse, strip and validate action lines in `assistant.py`; return `actions`
  - _Requirements: 1.2, 2.1–2.4_
  - The cache stores the raw proposals and re-validates them on every request, so a cached answer can't offer an action the case no longer allows.
- [x] 3. Tests in `backend/tests/test_assistant_actions.py` for valid, cross-workspace, role-limited and stale proposals, plus the strict parser
  - _Requirements: 2.1–2.4_
- [x] 4. Frontend: action buttons under Warden replies, confirmed by click, wired to existing endpoints (`components/assistant/assistant.tsx`)
  - _Requirements: 1.3, 3.1_
