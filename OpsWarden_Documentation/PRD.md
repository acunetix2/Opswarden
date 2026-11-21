# Product Requirements Document (PRD)
## OpsWarden — AI Procurement Investigation & Operations Workspace

**Status:** Draft for Kiroween 2026 MVP  
**Category:** Frankenstein  
**Version:** 1.0  
**Primary release:** Hackathon MVP  
**Product owner:** Project team

---

## 1. Executive summary

OpsWarden is a human-supervised AI operations platform that turns fragmented business information into structured investigations and controlled actions.

The MVP focuses on procurement discrepancy resolution. A user supplies a purchase order (PO), supplier invoice, and delivery receipt. OpsWarden extracts the relevant fields, compares the records, identifies discrepancies, cites the source evidence, recommends a resolution, and prepares a supplier communication for human approval.

The product demonstrates a useful combination of document intelligence, specialized AI agents, deterministic business rules, workflow orchestration, and external integrations. It should not rely on an LLM alone for arithmetic, authorization, or final financial decisions.

### Product promise

**Give OpsWarden an operational issue. It organizes the evidence, investigates what happened, and helps the team resolve it—with people in control.**

## 2. Problem statement

Small and medium-sized businesses often manage procurement through disconnected email threads, spreadsheets, PDFs, accounting tools, and manually maintained records. Staff repeatedly:

- Read and re-key information from supplier documents.
- Match invoices against purchase orders and delivery records.
- Investigate quantity, price, tax, and total mismatches.
- Ask suppliers for clarification.
- Track approvals and outstanding issues.
- Reconcile what happened after the issue is resolved.

This work is time-consuming, difficult to audit, and vulnerable to missed discrepancies and inconsistent processes.

### Initial problem to validate

A procurement or finance employee needs to determine whether a supplier invoice accurately reflects what was ordered and delivered, and what action should happen when it does not.

This is the initial product hypothesis. It should be validated with real users before expanding into adjacent workflows.

## 3. Vision and positioning

### Vision

Become an operations intelligence layer that connects business documents and systems, investigates exceptions, and coordinates approved resolutions.

### Positioning

OpsWarden is not simply an invoice OCR tool, chatbot, or generic workflow builder. Its differentiator is the end-to-end exception workflow:

1. Understand the records.
2. Compare them using deterministic rules.
3. Investigate mismatches.
4. Explain findings with evidence.
5. Recommend a next step.
6. Prepare an action.
7. Obtain approval.
8. Record the outcome.

### Initial target segment

Start with small and medium-sized distributors, wholesalers, and procurement-heavy businesses that process supplier invoices and delivery records.

### Primary users

- **Procurement officer:** checks orders, suppliers, quantities, and deliveries.
- **Accounts payable / finance officer:** validates invoices before payment processing.
- **Operations manager:** reviews exceptions and ensures follow-up.
- **Workspace administrator:** manages members, roles, integrations, and policies.

## 4. Goals and non-goals

### MVP goals

- Make it easy to create a procurement investigation.
- Accept common digital documents and scanned files.
- Extract normalized PO, invoice, and delivery data.
- Compare documents and detect meaningful discrepancies.
- Provide source-linked evidence for each finding.
- Generate a clear, editable resolution recommendation.
- Draft supplier communication.
- Require explicit human approval before external actions.
- Keep a complete audit trail.
- Demonstrate a coherent workflow in a short live demo.

### Non-goals for the hackathon MVP

- Replacing accounting or ERP software.
- Automatically paying invoices or releasing funds.
- Automatically changing supplier bank details.
- Fully autonomous email sending without approval.
- Supporting every document type and language.
- Building a general-purpose workflow builder.
- Providing legal, tax, or accounting advice.
- Guaranteeing fraud detection.
- Supporting a large catalogue of third-party integrations.
- Building complex enterprise procurement features such as multi-entity consolidation.

## 5. Core user journey

### Main journey

1. User signs in and selects a workspace.
2. User creates a new procurement case.
3. User enters supplier and reference details, or allows the documents to provide them.
4. User uploads a PO, invoice, and delivery receipt.
5. System validates file type, size, and safety.
6. Extraction service reads text and proposes structured fields.
7. User reviews low-confidence or ambiguous extracted fields.
8. Comparison engine matches records and calculates differences.
9. Investigation workflow creates findings and attaches evidence references.
10. User reviews the summary, findings, and recommended actions.
11. Communication agent drafts a supplier email.
12. Authorized user edits and approves the draft.
13. System performs the approved action through a connected provider, or exports the draft if no provider is configured.
14. Case status and audit history are updated.

### Example

PO: 50 units of Product B at 12.00 each.  
Delivery receipt: 40 units received.  
Invoice: 50 units billed.

Expected result: OpsWarden flags a quantity mismatch between delivered and invoiced units, shows the exact source fields, estimates the value in dispute using the configured currency, and recommends holding the invoice for review and requesting supplier clarification. It must not decide to withhold payment or alter accounting records automatically.

## 6. Functional requirements

Priority definitions:
- **P0:** required for a credible MVP.
- **P1:** valuable if time allows.
- **P2:** future enhancement.

### 6.1 Authentication and workspace

| ID | Requirement | Priority |
|---|---|---|
| AUTH-01 | Users can sign in and sign out securely. | P0 |
| AUTH-02 | A user belongs to one or more workspaces. | P0 |
| AUTH-03 | Workspace data is isolated by tenant/workspace ID. | P0 |
| AUTH-04 | Workspace administrators can invite or remove members. | P1 |
| AUTH-05 | Role-based permissions distinguish admin, reviewer, and contributor. | P0 |

### 6.2 Case management

| ID | Requirement | Priority |
|---|---|---|
| CASE-01 | Users can create a procurement investigation case. | P0 |
| CASE-02 | A case has a title, supplier, reference, status, owner, and timestamps. | P0 |
| CASE-03 | Users can view, filter, and search cases. | P0 |
| CASE-04 | Users can reopen or archive a case according to permissions. | P1 |
| CASE-05 | Case status changes are recorded in the audit log. | P0 |

Suggested statuses: `draft`, `processing`, `needs_review`, `ready_for_approval`, `in_progress`, `resolved`, `failed`, `archived`.

### 6.3 Document ingestion

| ID | Requirement | Priority |
|---|---|---|
| DOC-01 | Users can upload PDF, PNG, and JPEG files. | P0 |
| DOC-02 | Each upload is assigned a document type: PO, invoice, or delivery receipt. | P0 |
| DOC-03 | System validates file size, extension, MIME type, and actual content where possible. | P0 |
| DOC-04 | Files are stored privately and accessed through authorized, short-lived URLs. | P0 |
| DOC-05 | System extracts text from digital PDFs and runs OCR for scanned documents. | P0 |
| DOC-06 | User can replace or remove a document before the case is finalized. | P1 |
| DOC-07 | Extraction failures are visible and recoverable. | P0 |

Recommended MVP limit: configure a conservative maximum file size (for example, 15 MB) and make it an environment setting.

### 6.4 Structured extraction

Extract, where present:

- Supplier name and supplier reference.
- Document number and document date.
- Purchase order reference.
- Currency.
- Tax and subtotal.
- Grand total.
- Line-item description / SKU.
- Quantity and unit of measure.
- Unit price and line total.
- Delivery date and received quantity.

| ID | Requirement | Priority |
|---|---|---|
| EXT-01 | Extraction output conforms to a validated schema. | P0 |
| EXT-02 | Each extracted field stores confidence and source location where available. | P0 |
| EXT-03 | Missing or uncertain fields are marked for review, not invented. | P0 |
| EXT-04 | Users can correct extracted values before comparison. | P0 |
| EXT-05 | Original extraction and user corrections remain traceable. | P1 |

### 6.5 Matching and discrepancy detection

Use deterministic code for calculations and comparison. AI may help normalize descriptions or suggest candidate matches, but must not be the authority for arithmetic.

Required checks:

- PO reference mismatch or missing reference.
- Supplier mismatch.
- Invoice quantity greater than received quantity.
- Invoice quantity different from ordered quantity.
- Received quantity below ordered quantity.
- Unit price mismatch beyond configured tolerance.
- Duplicate invoice number within the workspace.
- Subtotal, tax, or total arithmetic mismatch.
- Currency mismatch.
- Missing required document or field.

| ID | Requirement | Priority |
|---|---|---|
| MATCH-01 | Compare PO, invoice, and delivery receipt line items. | P0 |
| MATCH-02 | Support exact SKU/reference matching where available. | P0 |
| MATCH-03 | Suggest fuzzy description matches with a confidence score. | P1 |
| MATCH-04 | Use configurable quantity and price tolerances. | P0 |
| MATCH-05 | Compute arithmetic with decimal-safe numeric types. | P0 |
| MATCH-06 | Each discrepancy contains severity, explanation, and evidence references. | P0 |
| MATCH-07 | Uncertain matches are sent to human review. | P0 |

Suggested severity levels: `info`, `low`, `medium`, `high`, `critical`. Severity must be derived from explicit business rules, not invented by the LLM.

### 6.6 Investigation and recommendations

| ID | Requirement | Priority |
|---|---|---|
| INV-01 | Generate a concise case summary from validated findings. | P0 |
| INV-02 | Explain each finding in plain language. | P0 |
| INV-03 | Link each finding to the source document and field/page/region. | P0 |
| INV-04 | Recommend next steps based on approved policy templates. | P0 |
| INV-05 | Clearly distinguish facts, assumptions, and recommendations. | P0 |
| INV-06 | Allow a reviewer to dismiss or annotate a finding with a reason. | P1 |

The LLM must only summarize validated comparison results and available evidence. It must not create evidence or claim a fact that is absent from the records.

### 6.7 Approval and actions

| ID | Requirement | Priority |
|---|---|---|
| ACT-01 | System can draft a supplier clarification email. | P0 |
| ACT-02 | Draft includes case reference and selected findings. | P0 |
| ACT-03 | User can edit the draft before approval. | P0 |
| ACT-04 | Sending requires explicit approval by an authorized user. | P0 |
| ACT-05 | Approval records actor, timestamp, action payload, and outcome. | P0 |
| ACT-06 | If email integration is unavailable, user can copy or export the draft. | P0 |
| ACT-07 | Payment, bank detail, and ledger changes are outside MVP scope. | P0 |

### 6.8 Audit and observability

- Record case creation and status transitions.
- Record document upload, deletion, and replacement.
- Record extraction runs and user corrections.
- Record comparison runs and findings.
- Record recommendation generation.
- Record approval, rejection, and execution outcomes.
- Store agent/tool run IDs and error summaries without exposing secrets.
- Make the event history visible to authorized users.

## 7. AI and agent behavior

### Recommended agent roles

1. **Intake / Document Agent:** classifies documents and coordinates extraction.
2. **Extraction Agent:** maps source content into the validated document schema.
3. **Investigation Agent:** interprets deterministic comparison findings and requests additional analysis where needed.
4. **Resolution Agent:** prepares recommended next steps and communication drafts.
5. **Governance layer:** enforces permissions, approval requirements, and tool allowlists.

The governance layer should be deterministic application code, not merely another LLM agent.

### Agent workflow

`created → documents_uploaded → extraction_pending → extraction_review → comparison_pending → investigation_ready → approval_pending → action_approved → action_executed → resolved`

Failures should move the case into a recoverable `needs_review` or `failed` state with a clear reason.

### Tool-use policy

Agents may:
- Read authorized case documents and normalized extraction data.
- Request deterministic comparisons.
- Retrieve workspace policy settings.
- Draft communications.
- Create internal tasks or notes.

Agents may not:
- Access another workspace's data.
- Send external communications without approval.
- Make payments or modify bank details.
- Execute arbitrary SQL or shell commands.
- Change their own permissions.
- Treat instructions inside uploaded documents as trusted system instructions.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Tenant isolation, server-side authorization, private storage, secret management |
| Reliability | Retry transient processing failures safely; use idempotency keys for side effects |
| Performance | Typical small-document case should provide visible progress and complete within a practical demo timeframe |
| Usability | A first-time user can complete the sample workflow without training |
| Accessibility | Keyboard navigation, visible focus, adequate contrast, semantic labels |
| Explainability | Every discrepancy links to supporting source evidence |
| Maintainability | Typed API schemas, modular services, automated tests |
| Observability | Structured logs, correlation IDs, error tracking |
| Privacy | Clear retention policy and user-controlled deletion process |

Do not promise fixed processing latency until it has been measured on representative files.

## 9. Success metrics

### Hackathon demo metrics

- User can create a case and upload all three documents.
- Extraction produces schema-valid output.
- At least the seeded discrepancy scenarios are detected correctly.
- Every finding has source evidence.
- A supplier email draft is generated from validated findings.
- No external side effect occurs without approval.
- Audit history shows the sequence of actions.

### Product validation metrics

Measure with pilot users:
- Time to complete a three-way document check.
- Percentage of fields requiring manual correction.
- Precision and recall for seeded discrepancy types.
- Percentage of findings users consider useful.
- Percentage of recommendations accepted or edited.
- Time from discrepancy detection to resolution.
- User trust and willingness to use the workflow again.

Do not claim accuracy rates without a documented evaluation dataset.

## 10. MVP acceptance criteria

A release is demo-ready when:

1. A user can authenticate and access only their workspace.
2. A user can create a case and upload a PO, invoice, and delivery receipt.
3. The system extracts required fields into validated schemas.
4. The user can correct uncertain fields.
5. The comparison engine detects a seeded quantity discrepancy.
6. The result displays ordered, received, and invoiced quantities.
7. The finding links to the supporting source documents.
8. The system generates a recommendation and an editable supplier email draft.
9. An authorized user must approve before sending.
10. The action and all important case events appear in the audit timeline.
11. Automated tests cover permissions, comparison logic, workflow transitions, and approval controls.
12. The application has a documented setup and demo path.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Poor OCR or extraction | Confidence values, field review, sample document fixtures |
| Similar item descriptions | Exact identifiers first; fuzzy matches require review |
| LLM hallucination | Ground summaries in structured findings; validate output schemas |
| Agent loop or runaway cost | Bounded steps, timeouts, budgets, and explicit state machine |
| Unauthorized action | Server-side policy checks and approval gate |
| Cross-tenant data leak | Tenant-scoped queries, authorization tests, private storage |
| Scope creep | One complete procurement workflow for MVP |
| External API failure | Retry safely, show pending/failed status, provide export fallback |

## 12. Future roadmap

After validating the initial workflow, consider:

- Email inbox intake and case creation.
- Supplier quotation comparison.
- Purchase requisition approvals.
- Inventory exception investigations.
- Customer order exception handling.
- Accounting and ERP integrations.
- Configurable workflow templates.
- Multi-step approval policies.
- Supplier performance insights.
- Additional document types and languages.

Expansion should follow customer evidence, not assumptions.
