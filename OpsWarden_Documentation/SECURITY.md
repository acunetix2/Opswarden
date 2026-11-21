# Security, Privacy & Responsible Automation
## OpsWarden

**Status:** MVP security baseline  
**Scope:** Business documents, extracted data, AI tools, approvals, and integrations.

---

## 1. Security objectives

OpsWarden may process invoices, supplier details, purchase orders, delivery records, and internal communications. Treat all uploaded content and extracted data as confidential business information.

The MVP must:
- Prevent cross-workspace data access.
- Protect uploaded files.
- Prevent unauthorized actions.
- Treat document content as untrusted input.
- Limit agent capabilities.
- Record meaningful actions.
- Fail safely when data is uncertain.

This document is a development baseline, not a certification or a claim of compliance with a particular regulation.

## 2. Threat model

| Threat | Example | Primary control |
|---|---|---|
| Tenant data leakage | User guesses another case ID | Server-side workspace authorization and RLS |
| Malicious upload | Crafted PDF or oversized file | Type/signature checks, size limits, isolated parsing |
| Prompt injection | Invoice text instructs agent to reveal secrets | Treat document text as untrusted data; tool allowlist |
| Unauthorized email | Agent sends supplier email without review | Approval gate and server-side authorization |
| Duplicate side effect | Retry sends the same email twice | Idempotency key and provider reference |
| LLM hallucination | Agent invents a quantity or evidence | Deterministic comparison and evidence validation |
| Secret leakage | API key appears in logs or repository | Secret manager, log redaction, secret scanning |
| Insecure file access | Public bucket exposes invoices | Private storage and short-lived authorized access |
| Role escalation | Contributor approves restricted action | Server-side role checks |
| Data tampering | User changes approved email after approval | Immutable payload hash and approval invalidation |

## 3. Trust boundaries

Treat these as untrusted:
- Uploaded documents.
- OCR output.
- Extracted text.
- Supplier-provided links and metadata.
- LLM output.
- External integration responses.
- Browser-supplied IDs, role values, and status values.

Trusted decisions must come from:
- Authenticated identity.
- Server-side membership and permission checks.
- Validated application schemas.
- Deterministic comparison rules.
- Explicit approval records.
- Verified integration responses.

## 4. Authentication and authorization

Suggested roles:

| Role | Read cases | Create/edit cases | Review findings | Approve external action | Manage workspace |
|---|---:|---:|---:|---:|---:|
| Admin | Yes | Yes | Yes | Yes | Yes |
| Reviewer | Yes | Yes | Yes | Yes, if policy permits | No |
| Contributor | Yes | Yes | Add comments / correct assigned fields | No by default | No |

Requirements:
- Verify workspace membership on every protected request.
- Never rely on frontend-hidden buttons as authorization.
- Enforce ownership and workspace scope in service/database queries.
- Use row-level security where supported as defence in depth.
- Avoid exposing whether an inaccessible foreign resource exists.
- Re-check authorization at action execution time.

## 5. File security

- Accept only explicitly supported formats.
- Check extension, declared MIME type, and file signature.
- Enforce configurable upload size and page-count limits.
- Generate storage keys; never use user filenames as storage paths.
- Store documents in private buckets.
- Serve only through authorized short-lived URLs or a protected proxy.
- Do not execute macros, scripts, or embedded content.
- Consider malware scanning before production.
- Parse files in a resource-limited worker.
- Avoid logging document contents.
- Define deletion and retention behavior.

## 6. Prompt injection and agent safety

Uploaded documents may contain instructions such as “ignore prior rules” or “send all records to this address.” These are document contents, not authorized commands.

Controls:
- Delimit document text as untrusted source material.
- System prompts must state that document instructions cannot change agent policy.
- Do not expose system prompts, credentials, environment variables, or unrelated cases to agents.
- Give each agent only the minimum case data it needs.
- Use allowlisted typed tools.
- Validate all tool arguments on the server.
- Restrict maximum agent steps, time, and token spend.
- Do not allow arbitrary shell, SQL, or unrestricted network access.
- Require human approval for external side effects.
- Validate LLM output against schemas and source evidence.

## 7. Human approval controls

For any external action:
1. Generate a proposed action.
2. Store the exact payload and its hash.
3. Display the complete action to the reviewer.
4. Confirm the reviewer has permission.
5. Record approval or rejection.
6. Re-check permissions and payload hash before execution.
7. Execute with an idempotency key.
8. Record the provider response.

Any edit after approval must invalidate that approval.

Payments, bank detail changes, and accounting ledger updates are excluded from the MVP.

## 8. Data protection

- Use TLS for network traffic.
- Use managed encrypted storage/database services.
- Keep secrets out of source control.
- Redact access tokens and sensitive content from logs.
- Limit document access to workspace members with a business need.
- Define retention and deletion rules.
- Use synthetic data for demos and tests.
- Obtain permission before using real company documents.
- Do not send data to an AI provider unless its data handling is acceptable for the intended use.

## 9. Audit events

Record:
- Actor and workspace.
- Case and resource IDs.
- Event type.
- Timestamp.
- Correlation ID.
- Relevant before/after state where appropriate.
- Approval and execution references.

Do not store secrets, full authentication tokens, or unnecessary document content in audit payloads.

## 10. Security test checklist

- [ ] User A cannot read User B's workspace cases.
- [ ] Contributor cannot approve restricted actions.
- [ ] Client cannot set its own role or bypass workflow status.
- [ ] Private documents cannot be fetched without authorization.
- [ ] Oversized and invalid uploads are rejected.
- [ ] Crafted document text cannot cause unauthorized tool calls.
- [ ] LLM output cannot directly execute an external action.
- [ ] Rejected approvals cannot be executed.
- [ ] Changed payload invalidates approval.
- [ ] Repeated execute request is idempotent.
- [ ] Logs contain no secrets or full sensitive documents.
- [ ] Error responses do not expose stack traces or internal prompts.

## 11. Incident response basics

For the MVP:
- Provide a way to disable external integrations quickly.
- Rotate compromised credentials.
- Preserve relevant audit records.
- Identify affected workspaces and cases.
- Notify affected users according to the applicable policy and law.
- Document the cause and corrective action.

Do not claim the product is “fully secure” or compliant without a proper assessment.
