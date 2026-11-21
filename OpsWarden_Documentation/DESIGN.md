# Product Design Specification
## OpsWarden — UX, UI, and Design System

**Version:** 1.0  
**Visual direction:** Premium enterprise operations console  
**Primary theme:** Dark charcoal / midnight navy with restrained amber-orange accents  
**Product personality:** Calm, precise, trustworthy, operational, intelligent

---

## 1. Design objective

OpsWarden should feel like a dependable business operations command center—not a science-fiction dashboard and not a generic chatbot.

The interface must help users answer five questions quickly:

1. What needs attention?
2. What happened?
3. What evidence supports the finding?
4. What should happen next?
5. Who must approve or complete the action?

Visual polish is important, but clarity and trust take priority over decorative effects.

## 2. Design principles

- **Clarity over spectacle:** use hierarchy, spacing, and concise language.
- **Evidence is first-class:** show the source document beside the extracted value and finding.
- **Progress is visible:** communicate processing, review, approval, and failure states.
- **Human authority is obvious:** distinguish AI suggestions from approved actions.
- **Dense but readable:** operations users need useful information without excessive scrolling.
- **Accessible by default:** keyboard support, semantic structure, visible focus, and adequate contrast.
- **Consistent interaction:** the same status, action, and evidence patterns should appear across screens.

## 3. Visual identity

### Color tokens

Use these as starting tokens and validate contrast in implementation.

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0B0F14` | App background |
| `--surface` | `#111821` | Main panels |
| `--surface-raised` | `#17212C` | Cards and overlays |
| `--surface-hover` | `#1D2A37` | Hover states |
| `--border` | `#293746` | Dividers and outlines |
| `--text-primary` | `#F4F7FA` | Main text |
| `--text-secondary` | `#A6B2BF` | Supporting text |
| `--text-muted` | `#748292` | Tertiary metadata |
| `--accent` | `#F59E0B` | Primary accent / attention |
| `--accent-strong` | `#D97706` | Accent hover / emphasis |
| `--success` | `#22C55E` | Resolved / verified |
| `--warning` | `#FBBF24` | Needs review |
| `--danger` | `#F87171` | Error / high-risk mismatch |
| `--info` | `#60A5FA` | Informational state |

Do not use color as the only signal. Pair status colors with text and icons.

### Typography

- Recommended typeface: Inter or Manrope.
- Page title: 24–30 px, semibold.
- Section title: 16–18 px, semibold.
- Body: 14–16 px.
- Metadata: 12–13 px.
- Numeric values: use tabular numerals where supported.
- Avoid all-caps for long labels.

### Shape and spacing

- Base spacing unit: 4 px.
- Main content padding: 24 px desktop, 16 px tablet, 12–16 px mobile.
- Card radius: 12–16 px.
- Input radius: 8–10 px.
- Use subtle borders rather than heavy shadows.
- Keep the primary content width readable; allow data tables to use available horizontal space.

## 4. Information architecture

Primary navigation:

1. **Overview** — operational snapshot and cases needing attention.
2. **Investigations** — list and search all cases.
3. **Approvals** — actions awaiting human review.
4. **Documents** — uploaded documents and processing status.
5. **Activity** — workspace audit history.
6. **Settings** — members, roles, policies, and integrations.

Workspace selector and user profile belong in the lower sidebar or top navigation, depending on responsive layout.

### Suggested route structure

- `/login`
- `/app/overview`
- `/app/investigations`
- `/app/investigations/new`
- `/app/investigations/[caseId]`
- `/app/approvals`
- `/app/documents`
- `/app/activity`
- `/app/settings`

## 5. Global application shell

### Desktop

- Fixed left sidebar, approximately 240–260 px.
- Top bar with page title/breadcrumb, workspace selector, search, notifications, and user menu.
- Main content uses a 12-column grid or flexible layout.
- Right-side contextual panel may be used for evidence or case activity on detail screens.
- Avoid persistent floating chat UI that competes with the work.

### Tablet

- Collapsible sidebar.
- Keep primary actions visible.
- Convert three-column detail layouts into two columns.

### Mobile

- Use a compact top bar and bottom navigation or a drawer.
- Stack metrics and cards.
- Convert wide tables into labelled cards or horizontally scrollable tables.
- Keep approval actions reachable and clearly separated.
- Do not hide critical discrepancy details behind hover-only interactions.

## 6. Core screens

### 6.1 Login

Purpose: secure, simple entry.

Elements:
- OpsWarden mark and product name.
- Short value proposition.
- Email and password fields.
- Sign-in button.
- Password reset link.
- Clear validation and error states.

Avoid an oversized marketing hero that delays access to the application.

### 6.2 Overview dashboard

Purpose: show the current operational state and the next useful action.

Suggested layout:
- Greeting and workspace name.
- Primary CTA: `New investigation`.
- Four metric cards:
  - Open investigations.
  - Needs review.
  - Awaiting approval.
  - Resolved this period.
- “Needs your attention” list.
- Recent investigations table.
- Recent activity feed.

Metrics must be calculated from actual case data. Do not hardcode impressive-looking statistics in production.

### 6.3 Investigations list

Columns:
- Case ID.
- Supplier.
- Case title / reference.
- Issue type or finding count.
- Status.
- Owner.
- Last updated.

Features:
- Search by supplier, reference, or case ID.
- Filter by status, date, and owner.
- Sort by updated date.
- Empty state with a clear create-case action.
- Loading skeleton and error/retry state.

### 6.4 New investigation wizard

Use a short, guided three-step flow:

**Step 1 — Case details**
- Case title.
- Supplier.
- Purchase order reference (optional if extracted later).
- Currency.
- Internal notes.

**Step 2 — Upload documents**
- PO upload.
- Invoice upload.
- Delivery receipt upload.
- File type, size, upload progress, and remove/replace action.

**Step 3 — Review and start**
- Confirm document labels.
- Show missing document warnings.
- Start analysis.

Do not block a user from saving a draft if one document is missing. Clearly state that full three-way matching requires the relevant records.

### 6.5 Investigation detail

This is the most important screen.

Recommended desktop layout:

- Header: case ID, supplier, status, created date, owner.
- Main column:
  - Executive summary.
  - Discrepancy cards.
  - Comparison table.
  - Recommended next steps.
- Side panel:
  - Source documents.
  - Evidence details.
  - Activity timeline.
- Sticky bottom or top action bar:
  - Add note.
  - Regenerate analysis (if allowed).
  - Prepare supplier email.
  - Submit action for approval.

#### Discrepancy card anatomy

- Severity label and readable status.
- Short title, e.g. “Invoice quantity exceeds delivered quantity”.
- Explanation in plain language.
- Comparison values: ordered, received, invoiced.
- Financial impact estimate, with currency and calculation explanation.
- Evidence links to document/page/field.
- Confidence or review indicator where relevant.
- Reviewer actions: confirm, dismiss with reason, or request review.

Never show a model confidence score as if it were a probability of fraud or correctness. Explain what confidence refers to (for example, extraction confidence).

### 6.6 Evidence viewer

Purpose: let users verify the source behind a finding.

Elements:
- Document preview or secure download.
- Document type and filename.
- Page navigation for PDFs.
- Highlighted source region when available.
- Extracted field name and value.
- Link back to the finding that references it.

If source-region highlighting is not implemented, show page number and extracted text snippet rather than implying precise visual localization.

### 6.7 Approval center

Show pending actions as review cards.

Each card should include:
- Proposed action.
- Related case.
- Recipient or target system.
- Full action preview.
- Why the action was recommended.
- Evidence links.
- Risk / permission notice.
- Approve and reject controls.

Approval must be an explicit user action. Use a confirmation dialog for external side effects. Do not preselect approval.

### 6.8 Supplier email composer

- Recipient field (only if known from trusted case/workspace data).
- Subject.
- Editable message body.
- Related case and evidence summary.
- Clear `Save draft`, `Request approval`, and—only if implemented—`Approve and send` actions.
- Show whether sending is connected or whether the draft can only be copied/exported.

Never invent a supplier email address.

### 6.9 Activity timeline

Chronological events:
- Case created.
- Documents uploaded.
- Extraction completed.
- User corrected a field.
- Comparison completed.
- Finding confirmed/dismissed.
- Recommendation generated.
- Approval requested/approved/rejected.
- Action executed or failed.

Display actor type (user or system/agent), timestamp, and concise details. Do not expose internal chain-of-thought; show useful evidence and decision summaries instead.

## 7. Component inventory

Reusable components:

- `AppShell`
- `SidebarNavigation`
- `TopBar`
- `PageHeader`
- `MetricCard`
- `StatusBadge`
- `CaseTable`
- `CaseRow`
- `DocumentUploadCard`
- `DocumentTypeSelector`
- `ProcessingStatus`
- `ExtractionReviewTable`
- `ComparisonTable`
- `DiscrepancyCard`
- `EvidenceLink`
- `EvidenceViewer`
- `RecommendationPanel`
- `ApprovalCard`
- `EmailComposer`
- `ActivityTimeline`
- `EmptyState`
- `ErrorState`
- `ConfirmActionDialog`
- `Toast / InlineNotice`

## 8. Interaction states

Every major screen should design:

- Default.
- Loading.
- Empty.
- Partial data.
- Validation error.
- Processing.
- Needs human review.
- Permission denied.
- Network or provider failure.
- Success.
- Disabled / unavailable integration.

Use optimistic UI only for reversible local changes. For external actions, wait for server confirmation.

## 9. Copywriting and terminology

Prefer plain, operational language.

| Avoid | Prefer |
|---|---|
| AI magic | Investigation |
| Hallucination score | Extraction confidence / match confidence |
| Execute everything | Review proposed action |
| Fraud detected | Potential discrepancy identified |
| Autonomous decision | AI recommendation |
| Error | Needs review / Processing failed |

Use careful language: “The invoice lists 50 units; the delivery receipt records 40” is better than “The supplier overcharged you” unless the evidence and business rules establish that conclusion.

## 10. Accessibility and responsive requirements

- WCAG-aware contrast for text and controls.
- All controls have labels.
- Keyboard-accessible menus, dialogs, tabs, and tables.
- Focus is visible.
- Status is conveyed with text and icon as well as color.
- Tables have semantic headers.
- Upload controls support keyboard and screen readers.
- Respect reduced-motion preferences.
- At narrow widths, prioritize case status, finding summary, evidence, and approval actions.

## 11. Design acceptance checklist

- A first-time user can identify how to start an investigation.
- The dashboard distinguishes open, review, approval, and resolved states.
- Each discrepancy shows the compared values and evidence.
- AI recommendations are visually distinct from verified facts.
- External actions are clearly gated by approval.
- Loading, error, empty, and success states are designed.
- The UI works at desktop, tablet, and mobile widths.
- No key action relies on color alone or hover alone.
