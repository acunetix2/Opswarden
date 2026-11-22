---
inclusion: manual
---
# Security review (run with #security-review)

Review the files changed in this session (or the files I name) as a security reviewer for OpsWarden. For each finding give: severity (critical/high/medium/low), file and line, what an attacker could do, and the concrete fix.

Check specifically:
1. Every new route uses `workspace_context`/`load_case`/`load_document` and `ctx.require(...)`; non-members get 404.
2. Ids in request bodies (supplier, purchase order, case, document) are verified to belong to the caller's workspace.
3. No path, filename or user input reaches storage keys, SQL, shell commands or URLs unchecked.
4. Uploads are validated by extension, MIME and magic bytes and size-limited.
5. No model output is executed, trusted for arithmetic, or sent externally without approval and `grounding_problem`.
6. No secrets, tokens, prompts or model output in logs, audit payloads or error messages.
7. Anything that sends email or verifies a password is rate limited.

Do not approve a change only because tests pass. End with a one-line verdict: SAFE TO MERGE or CHANGES REQUIRED.
