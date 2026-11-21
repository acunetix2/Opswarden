# OpsWarden — Product Documentation

**Project:** OpsWarden  
**Working tagline:** From business chaos to controlled execution.  
**Hackathon category:** Frankenstein  
**Document set:** Product requirements, product design, visual preview brief, architecture, implementation plan, API contracts, security, and Kiro development guide.

## What is OpsWarden?

OpsWarden is an AI-powered business operations platform that helps small and medium-sized businesses investigate operational issues and coordinate approved resolutions. Its initial use case is procurement and invoice discrepancy investigation.

A user uploads a purchase order, supplier invoice, and delivery receipt. OpsWarden extracts structured data, compares the records, identifies discrepancies with evidence, recommends next steps, and prepares an action—such as a supplier clarification email—for human approval.

OpsWarden is not intended to be an unrestricted autonomous finance system. It is a human-supervised operations workspace with traceable findings, explicit permissions, and auditable actions.

## Documents

| File | Purpose |
|---|---|
| `PRD.md` | Product vision, users, requirements, workflows, scope, metrics, and acceptance criteria |
| `DESIGN.md` | UX principles, information architecture, design system, components, and screen specifications |
| `IMAGE-PREVIEW.md` | Visual direction, screen preview briefs, and image-generation prompts for mockups |
| `ARCHITECTURE.md` | System architecture, components, data model, agent orchestration, and deployment |
| `API-CONTRACTS.md` | Proposed API endpoints, request/response examples, and event contracts |
| `IMPLEMENTATION-PLAN.md` | Phased delivery plan, milestones, testing strategy, and definition of done |
| `SECURITY.md` | Threat model, trust boundaries, permissions, data handling, and safety controls |
| `KIRO-GUIDE.md` | How to use Kiro specs, steering, hooks, agents, Crew, MCP, and testing |

## MVP boundary

The first release should prove one complete workflow exceptionally well:

1. Create a workspace and procurement case.
2. Upload a purchase order, invoice, and delivery receipt.
3. Extract and normalize line items.
4. Compare quantities, prices, totals, and identifiers.
5. Produce evidence-linked findings.
6. Recommend a resolution.
7. Draft a supplier email.
8. Require a human to approve sending or recording the action.
9. Preserve an audit trail.

Do not attempt to build a full ERP, accounting ledger, unrestricted agent platform, or dozens of integrations in the hackathon MVP.

## Important product principles

- **Evidence before conclusions:** every discrepancy must point to the source document and extracted fields.
- **Human control:** external side effects require explicit authorization.
- **Explainability:** show what was compared, what differed, and why it matters.
- **Least privilege:** agents receive only the tools and data required for their task.
- **Reliable failure handling:** uncertain extraction or matching must be flagged for review, not silently guessed.
- **Tenant isolation:** workspace data must never leak between organizations.

## Suggested initial stack

- Frontend: Next.js, TypeScript, Tailwind CSS, and a component library such as shadcn/ui.
- Backend: Python with FastAPI.
- Database and authentication: PostgreSQL via Supabase.
- Object storage: Supabase Storage or an equivalent private object store.
- Background work: Redis-backed queue (for example Celery or RQ) where needed.
- Agent orchestration: a graph/state-machine approach such as LangGraph, or a small explicit orchestrator for the MVP.
- Document processing: PDF/text extraction plus OCR for scanned documents.
- Deployment: independently deployable frontend and API, with managed database/storage.

Treat these as recommended choices, not mandatory dependencies. Prefer the simplest implementation that meets the acceptance criteria.
