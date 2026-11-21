# OpsWarden — Implementation Plan

**Target:** Kiroween 2026 hackathon MVP  
**Approach:** Vertical slices; prove one complete workflow before adding breadth.

---

## 1. Delivery strategy

Build the smallest reliable product that demonstrates:

- Document ingestion.
- Structured extraction.
- Deterministic three-way matching.
- Evidence-backed discrepancy findings.
- AI-generated recommendation.
- Human approval.
- Auditable action.

Prioritize a working end-to-end flow over a large number of unfinished features.

## 2. Milestones

### Milestone 0 — Validate and define (1–2 days)

Deliverables:
- Interview 3–5 procurement, finance, or operations users if possible.
- Collect sanitized sample documents or create clearly labelled synthetic fixtures.
- Confirm the most common discrepancy types.
- Freeze MVP requirements.
- Create GitHub repository and license.
- Create `.kiro/` at repository root.

Exit criteria:
- A concrete user problem and demo scenario are documented.
- MVP scope is frozen.
- No sensitive real business documents are used without permission.

### Milestone 1 — Foundation (2–3 days)

Deliverables:
- Frontend app shell and routing.
- FastAPI project and health endpoint.
- Authentication and workspace model.
- Database migrations.
- Role checks.
- Private file storage.
- CI workflow and formatting/linting.

Exit criteria:
- User can sign in, access their workspace, and create a case.
- Tenant authorization tests pass.

### Milestone 2 — Document ingestion (2–3 days)

Deliverables:
- Upload UI for PO, invoice, and delivery receipt.
- File validation and private storage.
- PDF text extraction.
- OCR fallback for image/scanned files.
- Extraction schema and persistence.
- Extraction review UI.

Exit criteria:
- Sample fixtures can be uploaded and extracted.
- Invalid files are rejected safely.
- Low-confidence fields can be reviewed.

### Milestone 3 — Comparison engine (2–3 days)

Deliverables:
- Normalization utilities.
- Exact identifier matching.
- Quantity and unit-price checks.
- Duplicate invoice check.
- Total arithmetic validation.
- Evidence references.
- Unit and property-based tests.

Exit criteria:
- Seeded discrepancy scenarios produce expected findings.
- Arithmetic uses decimal-safe types.
- Ambiguous matches are not silently accepted.

### Milestone 4 — Agent investigation and recommendations (2–3 days)

Deliverables:
- Bounded orchestration workflow.
- Investigation summary based on validated findings.
- Recommendation schema.
- Supplier email draft generation.
- Agent/tool run audit metadata.
- Cost and timeout limits.

Exit criteria:
- The LLM cannot invent source evidence in the output schema.
- Recommendations reference actual findings.
- Failed agent calls are visible and recoverable.

### Milestone 5 — Approval and audit (1–2 days)

Deliverables:
- Approval queue.
- Editable email draft.
- Approval and rejection flow.
- Optional email provider integration.
- Idempotent execution endpoint.
- Audit timeline.

Exit criteria:
- No external action occurs without approval.
- Approval is invalidated if the payload changes.
- Repeated execution does not send duplicate actions.

### Milestone 6 — Polish and submission (2–3 days)

Deliverables:
- Responsive UI.
- Loading, empty, error, and success states.
- Demo seed data.
- README and setup instructions.
- Deployment and smoke tests.
- Under-three-minute demo video.
- Kiro usage write-up.
- Final Devpost submission.

Exit criteria:
- A clean environment can follow the README and run the app.
- Public GitHub repo includes license and `.kiro/`.
- Public deployed app is testable.
- Demo shows the real working product.

## 3. Suggested task breakdown

### Frontend
- [ ] App shell and navigation.
- [ ] Login and workspace selector.
- [ ] Overview dashboard.
- [ ] Investigations list.
- [ ] New case wizard.
- [ ] Upload and processing states.
- [ ] Extraction review.
- [ ] Investigation detail and comparison table.
- [ ] Evidence viewer.
- [ ] Approval center.
- [ ] Email composer.
- [ ] Activity timeline.
- [ ] Responsive and accessibility pass.

### Backend
- [ ] FastAPI foundation.
- [ ] Auth and workspace dependencies.
- [ ] Database models and migrations.
- [ ] Case CRUD.
- [ ] Document upload and validation.
- [ ] Storage adapter.
- [ ] PDF extraction and OCR.
- [ ] Structured extraction schema.
- [ ] Comparison engine.
- [ ] Finding and evidence persistence.
- [ ] Agent orchestration.
- [ ] Recommendation generation.
- [ ] Approval service.
- [ ] Email adapter or export fallback.
- [ ] Audit service.
- [ ] Rate limits and observability.

### Quality
- [ ] Unit tests for normalization.
- [ ] Unit tests for money calculations.
- [ ] Property tests for comparison invariants.
- [ ] Integration tests for tenant isolation.
- [ ] Integration tests for approval gates.
- [ ] Upload security tests.
- [ ] End-to-end demo scenario.
- [ ] Failure and retry tests.

## 4. Test dataset

Create synthetic, clearly labelled fixtures covering:

1. Perfect match.
2. Invoice quantity greater than received quantity.
3. Delivery quantity below ordered quantity.
4. Unit price mismatch.
5. Duplicate invoice number.
6. Incorrect invoice arithmetic.
7. Supplier name mismatch.
8. Missing PO reference.
9. Ambiguous item description.
10. OCR low-confidence value.

For each fixture, define the expected normalized data and expected findings. Keep fixtures version-controlled and do not include confidential customer documents.

## 5. Testing strategy

### Unit tests
- Text and currency normalization.
- Quantity comparison.
- Price tolerance.
- Line-item matching.
- Total calculations.
- State transitions.
- Permission decisions.

### Property-based tests
Useful invariants include:
- If ordered, received, and invoiced quantities are equal, no quantity discrepancy is emitted.
- Increasing invoiced quantity while other values remain fixed cannot remove an existing invoice-over-delivery finding.
- Reordering input line items should not change results when stable identifiers are present.
- A rejected approval must never execute.
- A changed action payload must invalidate the previous approval.
- A user outside a workspace must never retrieve that workspace's case.

### Integration tests
- Upload → extraction → comparison → finding.
- Case access under multiple roles.
- Approval → execute.
- Idempotent action execution.
- Provider timeout and retry.
- Private document access.

### End-to-end demo test
Automate the happy path using the synthetic discrepancy fixture.

## 6. Demo script (approximately 2 minutes 30 seconds)

**0:00–0:20 — Problem and product**
Explain that businesses reconcile supplier documents manually and that OpsWarden investigates discrepancies.

**0:20–0:45 — Create a case**
Open the app and create a procurement investigation.

**0:45–1:10 — Upload documents**
Upload the PO, supplier invoice, and delivery receipt. Show processing status.

**1:10–1:40 — Reveal the finding**
Show ordered 50, received 40, invoiced 50. Open the evidence references.

**1:40–2:05 — Recommendation**
Show the factual explanation and supplier clarification email draft.

**2:05–2:25 — Human approval**
Review and approve the proposed action, or show the approval gate if the email provider is not configured.

**2:25–2:30 — Close**
Show the audit timeline and state the product's broader direction.

Keep the demo focused. Do not spend time navigating menus or explaining implementation details while the product is on screen.

## 7. Definition of done

A feature is done only when:
- It meets its acceptance criteria.
- It has loading, empty, and failure states where relevant.
- Authorization is enforced on the server.
- Important changes are audited.
- Tests cover its core behavior.
- It is documented enough for another developer to run.
- It does not expose secrets or sensitive document content in logs.

## 8. Scope-control rules

If behind schedule:
1. Keep one document format path working end-to-end.
2. Keep deterministic comparison and evidence.
3. Keep approval gate and audit history.
4. Use a copy/export email fallback instead of a full email integration.
5. Defer advanced multi-agent collaboration, complex fuzzy matching, and additional departments.
6. Do not remove tenant isolation or approval controls to save time.
