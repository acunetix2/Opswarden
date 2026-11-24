<div align="center">

# OpsWarden

**From supplier paperwork to a defensible decision.**

OpsWarden reconciles a purchase order, a delivery receipt and a supplier invoice,
shows every discrepancy with the exact document field it came from,
and drafts the supplier email for a person to approve.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.118-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)
![Postgres](https://img.shields.io/badge/Supabase-Postgres%2017-3FCF8E?logo=supabase&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare&logoColor=white)
![Built with Kiro](https://img.shields.io/badge/Built%20with-Kiro-7C3AED)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)


</div>

---

## Why OpsWarden

Three-way matching is the oldest control in procurement, and it is still mostly done by eye. Someone opens three PDFs, compares quantities line by line, does the arithmetic and writes an email. Mistakes in either direction cost money: overpaying a supplier, or accusing one wrongly.

OpsWarden does the comparison deterministically and leaves the judgement to people.

| Principle | What it means in practice |
|---|---|
| **Evidence first** | Every finding names the rule, the expected and observed values, the impact, and the document field it came from. |
| **Exact arithmetic** | Money and quantities use `Decimal` end to end. Currencies are never added together. |
| **AI where it helps, never as the authority** | Models read scans, answer questions and polish wording. They never decide a finding, a severity or an amount. |
| **People approve side effects** | Nothing reaches a supplier until an authorised reviewer approves the exact text. |
| **Everything is on the record** | Uploads, corrections, decisions, approvals and sends are written to an audit trail. |

---

## How it works

```mermaid
flowchart LR
    A([Open a case]) --> B[Upload PO,<br/>delivery receipt,<br/>invoice]
    B --> C{{Run analysis}}
    C --> D[Extract fields]
    D --> E[Three-way match]
    E --> F[Findings with evidence]
    F --> G{Reviewer decides}
    G -- Confirm --> H[Draft supplier email]
    G -- Dismiss with reason --> F
    H --> I{Approval}
    I -- Approved --> J[Send or export]
    I -- Rejected --> H
    J --> K([Mark resolved])

    classDef human fill:#FFF4EC,stroke:#C2471A,color:#111;
    classDef system fill:#F4F4F2,stroke:#555,color:#111;
    class A,B,G,I,K human;
    class C,D,E,F,H,J system;
```

Orange steps are taken by a person. Grey steps are done by OpsWarden.

---

## System architecture

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["Next.js app<br/>cases · evidence · approvals"]
        W["Warden assistant<br/>+ read aloud"]
    end

    subgraph API["FastAPI service"]
        AUTH["Auth & workspace<br/>permissions"]
        ORCH["Analysis orchestrator<br/>(bounded state machine)"]
        EXT["Extraction<br/>text parser · OCR"]
        CMP["Comparison engine<br/>deterministic rules"]
        APR["Approval service<br/>payload hash lock"]
        AUD["Audit trail"]
        AST["Assistant & TTS<br/>endpoints"]
    end

    subgraph Data["Managed services"]
        PG[("Supabase Postgres<br/>row-level security on")]
        R2[("Cloudflare R2<br/>private bucket")]
    end

    subgraph AI["Model providers"]
        GROQ["Groq<br/>assistant · email wording"]
        GEM["Google Gemini<br/>OCR · text-to-speech"]
    end

    SMTP["Brevo SMTP"]

    UI -->|REST + live events| AUTH
    W --> AST
    AUTH --> ORCH --> EXT --> CMP --> AUD
    AUTH --> APR --> AUD
    EXT -.->|scans & photos| GEM
    AST -.-> GROQ
    AST -.-> GEM
    APR -.->|rephrase only| GROQ
    APR -->|after approval| SMTP
    API --> PG
    EXT --> R2
```

The API is a modular monolith. Each request is checked for workspace membership and role on the server; the frontend's permission checks only decide which buttons to show.

---

## The analysis pipeline

When someone presses **Run analysis**, the API answers immediately (`202 Accepted`) and runs the job in the background. Progress streams to the case page as events.

```mermaid
sequenceDiagram
    autonumber
    actor U as Analyst
    participant UI as Case page
    participant API as API
    participant O as Orchestrator
    participant S as R2 storage
    participant X as Extraction
    participant C as Comparison
    participant DB as Postgres

    U->>UI: Run analysis
    UI->>API: POST /cases/{id}/analyze
    API-->>UI: 202 processing
    API->>O: background job
    UI->>API: GET /cases/{id}/events (live stream)
    loop each document (latest upload per type)
        O->>S: fetch file
        O->>X: extract fields
        X-->>O: values + confidence per field
        O->>DB: save fields (human corrections are kept)
    end
    O->>C: PO · receipt · invoice
    C-->>O: findings + evidence + impact
    O->>DB: save findings, set status
    O-->>UI: investigation.completed
    UI->>U: findings, comparison table, summary
```

### Extraction: which reader handles a file

```mermaid
flowchart TD
    F[/Uploaded file/] --> T{File type}
    T -- JSON / text export --> P[Structured parser]
    T -- PNG / JPEG --> O[Vision OCR]
    T -- PDF --> L{Has a text layer?}
    L -- No, it's a scan --> O
    L -- Yes --> R[Text parser]
    R --> Q{Line items found?}
    Q -- Yes --> V
    Q -- No, unfamiliar layout --> O
    P --> V
    O --> A[Re-check the page's own<br/>arithmetic with Decimal]
    A --> V[Fields + confidence]
    V --> H{Confidence below 60%?}
    H -- Yes --> K[Flag: a person checks it]
    H -- No --> M[Ready for comparison]
```

The OCR model only transcribes what is printed. Afterwards each line (`quantity × unit price = line total`) and the totals (`lines = subtotal`, `subtotal + tax = total`) are re-computed. A number that doesn't reconcile on its own page is marked for review instead of quietly becoming a finding.

---

## The comparison rules

Lines are matched by SKU first and by description similarity second. Weak matches are flagged rather than trusted. Every rule is plain code with explicit severity.

| Area | Rule | Severity | Raised when |
|---|---|---|---|
| Completeness | `MISSING_DOCUMENT` | high / medium | The invoice, PO or receipt is missing |
| Identity | `SUPPLIER_MISMATCH` | high | The supplier name differs across documents |
| | `PO_REFERENCE_MISSING` | medium | The invoice doesn't cite a PO |
| | `PO_REFERENCE_MISMATCH` | medium | The invoice cites a different PO |
| | `CURRENCY_MISMATCH` | high | PO and invoice use different currencies |
| | `DUPLICATE_INVOICE` | high | The invoice number already exists for this supplier |
| Quantities | `INVOICE_QTY_GT_RECEIVED` | high | Billed for more than arrived |
| | `RECEIVED_QTY_LT_ORDERED` | medium | Short delivery |
| | `INVOICE_QTY_NE_ORDERED` | medium | Billed quantity differs from the order |
| Prices | `UNIT_PRICE_MISMATCH` | high | Invoice price differs from the PO beyond tolerance |
| Arithmetic | `LINE_TOTAL_MISMATCH` | medium | `qty × price ≠ line total` |
| | `TOTAL_MISMATCH` | high | Lines and tax don't add up to the invoice total |
| Matching | `AMBIGUOUS_MATCH` | low | A line could only be matched loosely |

Price and quantity tolerances are workspace policy, set by an admin in **Settings**.

**Example.** The PO orders 50 units at 12.00, the receipt records 40 and the invoice bills 50. OpsWarden raises `INVOICE_QTY_GT_RECEIVED` with an impact of **(50 − 40) × 12.00 = 120.00 USD**, plus a short-delivery finding, and cites the quantity field on each document.

---

## Human approval

A supplier email is built only from validated findings. A person edits it, and a reviewer approves that exact text.

```mermaid
sequenceDiagram
    autonumber
    actor A as Analyst
    actor R as Reviewer
    participant API as API
    participant L as Groq (optional)
    participant M as Brevo SMTP

    A->>API: Prepare letter
    API->>API: Deterministic draft from findings
    API->>L: Rephrase (no document text sent)
    L-->>API: Candidate wording
    API->>API: Grounding check: no new numbers,<br/>reference kept, no links or addresses
    API-->>A: Draft (template if the check fails)
    A->>API: Request approval (edited text)
    API->>API: Store SHA-256 of the exact payload
    R->>API: Approve
    R->>API: Send
    API->>API: Payload hash still matches?
    alt SMTP configured
        API->>M: Send once (idempotency key)
    else not configured
        API-->>R: Export the letter, never a fake "sent"
    end
```

Changing a single character after approval breaks the hash, so the edit needs a new approval. Contributors can prepare letters but cannot approve them.

---

## Autopilot: what OpsWarden does on its own

People make the decisions. OpsWarden does the routine work around them. Admins can switch each behaviour off under Settings > Automation; all are on by default.

```mermaid
flowchart LR
    D[/Drop documents/] --> I[Smart intake:<br/>read, find the PO,<br/>file on the right case]
    I --> R[Register:<br/>save supplier, contact details,<br/>PO and document numbers]
    R --> A[Three-way match]
    A -->|all three agree| C[Close as<br/>no discrepancy]
    A -->|findings| L[Draft supplier letter,<br/>queue for approval,<br/>email approvers]
    A -->|needs a check| V[Email reviewers]
    L --> P{Approver}
    P -->|approve| S[Send straight away]
    P -->|reject| X[Nothing sent]
```

- **Smart intake** (`Drop documents` in the sidebar): drop invoices, receipts and POs without opening a case. Each file is read once, matched to an open case, a registered PO, a registered supplier or its own printed details, and the analysis starts once a case has an invoice plus a PO or receipt.
- **Register from documents:** suppliers (with the email, phone and address printed for the seller), purchase orders and document numbers are saved as they are read. Entries a person typed are never overwritten, and every addition is in the activity log.
- **Follow-up after analysis:** clean cases close, letters are drafted and queued, and approvers get one email per case per hour.
- **Send on approval:** approving the letter sends it, with the same permission, hash and idempotency checks as the Send button.
- **Live run view:** each analysis shows five stages (read, register, match, weigh findings, follow up) ticking as they complete.

Nothing reaches a supplier without an approver seeing the exact text and recipient.

---

## Warden actions and recovery

- **Warden** can suggest up to three next steps (open a case, run the analysis, prepare the letter). The server checks each one against your role and the case status, and nothing runs until you click it.
- **Recovery:** resolving a case records the outcome (value recovered, corrected invoice, no discrepancy, written off) and the amount. The dashboard shows value recovered this period and all time, per currency.

---

## Case lifecycle

Status changes go through one controlled transition map. Clients can't set an arbitrary status.

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> processing: Run analysis
    processing --> needs_review: findings or fields need a person
    processing --> ready_for_approval: clean result
    processing --> failed
    needs_review --> processing: re-run after corrections
    needs_review --> ready_for_approval
    ready_for_approval --> in_progress: approved action sent
    ready_for_approval --> needs_review
    in_progress --> resolved
    needs_review --> resolved
    ready_for_approval --> resolved
    failed --> processing: retry
    resolved --> needs_review: reopen
    draft --> archived
    needs_review --> archived
    ready_for_approval --> archived
    resolved --> archived
    archived --> needs_review: reopen
    resolved --> [*]
```

---

## Data model

```mermaid
erDiagram
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    USER ||--o{ WORKSPACE_MEMBER : joins
    WORKSPACE ||--|| WORKSPACE_POLICY : "tolerances & rules"
    WORKSPACE ||--o{ CASE : owns
    CASE ||--o{ DOCUMENT : "PO · receipt · invoice"
    DOCUMENT ||--o{ EXTRACTION_RUN : processed_by
    DOCUMENT ||--o{ EXTRACTED_FIELD : yields
    CASE ||--o{ FINDING : raises
    FINDING ||--o{ FINDING_EVIDENCE : cites
    FINDING_EVIDENCE }o--|| DOCUMENT : points_to
    CASE ||--o{ RECOMMENDATION : drafts
    RECOMMENDATION ||--o| APPROVAL : "locked by hash"
    CASE ||--o{ AUDIT_EVENT : records

    CASE {
        string case_number "OW-2026-0001"
        string status
        string supplier_name
        string supplier_reference
    }
    EXTRACTED_FIELD {
        string field_path "line_items[0].quantity"
        string value
        decimal confidence
        string review_status "auto · needs_review · corrected"
    }
    FINDING {
        string rule_id
        string severity
        decimal impact_amount
        string status "open · confirmed · dismissed"
    }
    APPROVAL {
        string payload_hash "SHA-256"
        string status
        string idempotency_key
    }
```

Every row carries a `workspace_id`, and every query is scoped by it.

---

## Where AI is used, and where it isn't

```mermaid
flowchart LR
    subgraph Never["Deterministic code only"]
        direction TB
        N1[Line matching]
        N2[Arithmetic & impact]
        N3[Severity]
        N4[Permissions]
        N5[Status changes]
    end
    subgraph Assist["AI-assisted, checked by code or a person"]
        direction TB
        Y1["OCR of scans<br/><i>page arithmetic re-checked</i>"]
        Y2["Email wording<br/><i>grounding check + human approval</i>"]
        Y3["Warden answers<br/><i>read-only, cannot act</i>"]
        Y4["Read aloud<br/><i>audio not stored</i>"]
    end
```

**Warden**, the in-app assistant, answers from a permission-scoped snapshot of the workspace: case register, open findings, waiting approvals, and the current case if you're on one. File contents are never sent to it. Case numbers in its replies become links, and those links are built by the server from real records, so the model can't invent one.

If a model is unavailable, everything still works. Drafts fall back to templates and Warden falls back to built-in help.

---

## Roles

| Capability | Admin | Reviewer | Contributor |
|---|:---:|:---:|:---:|
| Create cases, upload documents, correct fields | ● | ● | ● |
| Confirm or dismiss findings | ● | ● | — |
| Draft letters and request approval | ● | ● | — |
| Approve and send supplier emails | ● | ●¹ | — |
| Workspace activity log, settings, team | ● | — | — |

¹ An admin can restrict approvals to admins in **Settings**.

---

## Getting started

**Prerequisites:** Python 3.12+, Node.js 20+.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --port 8099 --reload
```

With the defaults it uses SQLite and local disk, and seeds a demo workspace with sample cases. No external services are needed.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

### 3. Sign in

| Role | Email | Password |
|---|---|---|
| Admin | `admin@opswarden.app` | `Password123!` |
| Reviewer | `reviewer@opswarden.app` | `Password123!` |
| Contributor | `contributor@opswarden.app` | `Password123!` |

> [!WARNING]
> These are public demo credentials. On a hosted deployment, change the passwords or remove the accounts before real data goes in, and set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false`.

### 4. Try the demo path

1. Open the **Northstar Office Supplies** case and press **Run analysis**.
2. Open the high-severity finding and follow its evidence link to the invoice field.
3. Press **Prepare letter**, edit it, and **Request approval**.
4. Sign in as the contributor and notice you can't approve. Then approve as the admin and send or export the letter.

---

## Configuration

Copy `backend/.env.example` and `frontend/.env.example`. Every setting is optional for local development.

| Capability | Backend variables | Without it |
|---|---|---|
| Database | `DATABASE_URL` (Supabase session pooler URL) | Local SQLite |
| Document storage | `STORAGE_BACKEND=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_JURISDICTION` | Local disk |
| Assistant & email wording | `LLM_PROVIDER=groq`, `LLM_API_KEY`, `LLM_MODEL` | Built-in help and templates |
| OCR & read aloud | `GEMINI_API_KEY`, `OCR_MODEL`, `TTS_MODEL`, `TTS_VOICE` | Scans are flagged as failed; no audio |
| Email sending | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Approved letters are exported |
| Sign-in | `AUTH_PROVIDER` (`local` or `supabase`), `SUPABASE_URL` | Built-in email and password |
| Security | `SECRET_KEY` (32+ random characters), `FRONTEND_ORIGIN` | Development defaults |

**Settings → Integrations** shows which of these are connected on a running server.

---

## Deploying

```mermaid
flowchart LR
    GH[(GitHub<br/>main)] -->|auto-deploy| BE["Render web service<br/>opswarden-api · Frankfurt"]
    GH --> FE["Frontend host<br/>Next.js"]
    FE -->|HTTPS| BE
    BE -->|session pooler| PG[("Supabase Postgres<br/>eu-west-1")]
    BE --> R2[("Cloudflare R2<br/>private bucket")]
    BE --> EXT["Groq · Gemini · Brevo :2525"]
```

The API ships as a Render Blueprint (`render.yaml`). It builds only when `backend/` or the Blueprint changes, and Render checks `/health` before switching traffic to a new deploy.

### 1. Prepare the database

Run these once from `backend/` against Supabase. The migration only adds missing tables and columns, never drops anything, and enables row-level security:

```bash
python scripts/migrate.py            # read-only comparison
python scripts/migrate.py --apply    # create what's missing
python scripts/seed_demo_accounts.py # optional: the demo sign-in accounts
```

### 2. Check settings before deploying

```bash
python scripts/preflight_render.py https://your-frontend.example.com
```

This applies the production rules, writes, reads and deletes one test object in R2, and confirms the database URL is the Supabase pooler. It prints `READY FOR RENDER` when all three pass.

### 3. Create the service

Click **Deploy to Render** at the top of this page, or in Render go to **New → Blueprint** and pick this repository. Render asks for each secret once:

| Variable | Where it comes from |
|---|---|
| `FRONTEND_ORIGIN` | The frontend's public URL, exactly, with no trailing slash |
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** URI (`aws-…pooler.supabase.com:5432`) |
| `R2_ACCOUNT_ID`, `R2_BUCKET` | Cloudflare → R2 → bucket → **Settings** → S3 API URL |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 → **Manage API tokens** → Object Read & Write, this bucket only |
| `LLM_API_KEY` | Groq console → API keys |
| `GEMINI_API_KEY` | Google AI Studio → API keys |
| `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Brevo → **SMTP & API** → SMTP (the login and an SMTP key), plus a verified sender |

`SECRET_KEY` is generated by Render. Everything else has a production value in the Blueprint.

> [!NOTE]
> - **Render has no IPv6 outbound**, so use the Supabase *pooler* host. The direct `db.<ref>.supabase.co` host won't connect.
> - **Free instances block SMTP ports 25, 465 and 587**, which is why the Blueprint uses Brevo's port 2525.
> - **Free instances sleep after inactivity.** The first request after a pause takes longer while the service starts.
> - In production the API **refuses to start** with a weak secret, SQLite, local disk storage or a localhost origin. The deploy log names the setting to fix.

### 4. Connect the frontend

Set `NEXT_PUBLIC_API_URL` on the frontend host to the Render URL (for example `https://opswarden-api.onrender.com`), then build with `npm run build && npm run start`. If the frontend URL changes, update `FRONTEND_ORIGIN` on Render too, or browsers will block the requests.

### 5. Verify

Open `https://<your-service>.onrender.com/health`, then sign in, check **Settings → Integrations**, and run one case end to end.

---

## Testing

```bash
# Backend: unit, API flow, access control and property-based tests (Hypothesis)
cd backend && pytest -q

# Frontend: type safety and unit tests
cd frontend && npm run typecheck && npm test

# Live checks against running servers
python smoke_test.py               # full demo path, permissions, approvals
python scripts/smoke_ai.py         # assistant, read aloud, OCR on a scanned invoice
python scripts/preflight_render.py # production settings, R2 round trip, database host
```

The property-based tests cover the invariants that matter most:

- Equal quantities never produce a quantity finding.
- Reordering line items doesn't change the outcome.
- A rejected approval can't execute.
- An edited payload can't reuse an old approval.
- Retrying a sent action doesn't send twice.
- A non-member can't read another workspace's case.

---

## Security at a glance

| Threat | Control |
|---|---|
| Cross-tenant access | Every query is scoped by workspace. Non-members get `404`, not `403`. |
| Forged or replayed actions | Approvals are bound to a SHA-256 of the exact payload. Sends use idempotency keys. |
| Prompt injection in documents | Document text is treated as data. Models never receive tools, and email rewrites must pass a grounding check. |
| Malicious uploads | Extension, MIME type and file signature are all checked. Keys are opaque and never derived from filenames. |
| Leaked files | The R2 bucket is private. Files are streamed only to signed-in members. |
| Direct database access | Row-level security is enabled on every table exposed by Supabase's REST API. |
| Secrets in logs | Keys travel in headers, never URLs. Audit events store metadata, never model output. |

Detailed threat model: [`OpsWarden_Documentation/SECURITY.md`](OpsWarden_Documentation/SECURITY.md).

---

## Built with Kiro

OpsWarden was developed in the Kiro IDE. The `.kiro/` directory holds the steering files, specs, hooks and custom agents used to build it, and [`OpsWarden_Documentation/KIRO-GUIDE.md`](OpsWarden_Documentation/KIRO-GUIDE.md) describes the spec-driven workflow.

### OpsWarden MCP server

`backend/mcp_server/opswarden_mcp.py` gives MCP clients (Kiro, other agents) read-only access to your cases, findings, approvals and purchase orders. It calls the normal API with your own sign-in, so every permission and workspace check still applies, and no tool changes data or sends email.

Tools: `get_overview`, `list_cases`, `get_case`, `search`, `list_pending_approvals`, `list_purchase_orders`.

To use it in Kiro, copy `backend/mcp_server/kiro-mcp.json` to `.kiro/settings/mcp.json` and set these environment variables:

| Variable | Example |
|---|---|
| `OPSWARDEN_API_URL` | `https://opswarden.onrender.com` |
| `OPSWARDEN_EMAIL` / `OPSWARDEN_PASSWORD` | your OpsWarden sign-in (or `OPSWARDEN_TOKEN`) |
| `OPSWARDEN_WORKSPACE` | optional workspace name |

It runs with any Python 3; `httpx` is used if installed.

## Documentation

| Document | Contents |
|---|---|
| [PRD](OpsWarden_Documentation/PRD.md) | Users, requirements, scope, acceptance criteria |
| [Design](OpsWarden_Documentation/DESIGN.md) | UX principles, components, screens |
| [Architecture](OpsWarden_Documentation/ARCHITECTURE.md) | Components, data model, orchestration |
| [API contracts](OpsWarden_Documentation/API-CONTRACTS.md) | Endpoints, payloads, events |
| [Security](OpsWarden_Documentation/SECURITY.md) | Threat model and trust boundaries |
| [Implementation plan](OpsWarden_Documentation/IMPLEMENTATION-PLAN.md) | Milestones and definition of done |

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please don't open a public issue.

## License

OpsWarden is released under the [MIT License](LICENSE). Copyright © 2026 Iddy Chesire.
