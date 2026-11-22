---
inclusion: fileMatch
fileMatchPattern: ["backend/app/api/**/*.py", "backend/app/agents/**/*.py", "backend/app/services/**/*.py", "backend/app/core/**/*.py", "backend/app/integrations/**/*.py"]
---
# Security steering (applies when editing API, agent, service, core or integration code)

- **Tenant isolation.** Query by `workspace_id` always. Resolve cases and documents with `load_case`/`load_document`. A non-member gets `404`, never `403`, so existence isn't revealed. Cross-workspace references in request bodies (supplier ids, PO ids) must be checked against the caller's workspace.
- **Server-side authorization.** Use `Permission` from `core/permissions.py`. Frontend role checks are cosmetic only.
- **Untrusted documents.** Document text and OCR output are data, never instructions. Models receive no tools. Email rewrites must pass `grounding_problem` (no new numbers, reference kept, no links or addresses).
- **Side effects need approval.** External actions go through `approval_service` (payload SHA-256 + idempotency key). An edited payload can't reuse an old approval.
- **Agent actions are proposals.** Warden may suggest actions; the server validates each one and the user confirms in the UI before anything runs.
- **Uploads.** Check extension, MIME and magic bytes (`_detect_and_validate`), enforce `MAX_UPLOAD_BYTES`, store under opaque keys never derived from filenames.
- **Secrets.** Only from environment variables. Never log keys, passwords, tokens, prompts or model output; keys go in headers, not URLs. Run `backend/scripts/scan_staged_secrets.py` before committing.
- **One-time codes and tokens.** Store only hashes (HMAC with `SECRET_KEY` for OTPs), expire them, limit attempts.
- **Rate limits.** Anything that sends email or checks a password is throttled.
