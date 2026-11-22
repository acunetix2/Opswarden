# Design: Warden actions

- The system prompt asks the model to append zero to three lines `ACTION: <open_case|run_analysis|draft_letter> <CASE-NUMBER>` when relevant.
- `assistant.py` parses those lines with a strict regex, removes them from the reply, and validates each against the workspace snapshot (case exists, role permission, status, documents present, analyzed). Invalid proposals are dropped silently. Output: `actions: [{type, case_id, case_number, label}]`.
- The frontend renders proposals as buttons under the reply:
  - open case: navigate to the case
  - run analysis: `POST /cases/{id}/analyze` (existing endpoint, existing checks), then navigate
  - draft letter: navigate to `/app/investigations/{id}/email`, where the person prepares and edits the letter
- Nothing runs automatically, including in voice mode.

Testing: API tests with a fake provider that emits valid, invalid, cross-workspace and disallowed proposals; only valid ones survive and the action lines never appear in the reply.
