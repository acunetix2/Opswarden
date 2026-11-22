---
inclusion: always
---
# Architecture steering

Modular monolith: a FastAPI service (`backend/`) and a Next.js 16 app (`frontend/`), deployed separately.

## Backend (`backend/app`)
- `api/routes/*` thin HTTP handlers. Every handler resolves access through `api/deps.py` (`workspace_context`, `load_case`, `load_document`) and calls `ctx.require(Permission.X)`. Never trust a workspace or case id from the client without these helpers.
- `services/*` business logic. `comparison_service.py` is the deterministic three-way-match engine; `extraction_service.py` + `ocr_service.py` turn files into `StructuredDocument`; `investigation_service.py` builds summaries and grounded email drafts.
- `agents/orchestrator.py` is a bounded state machine for analysis: extract -> compare -> persist findings -> set status. No unbounded loops, no model calls inside it except OCR transcription.
- `agents/llm_provider.py` + `llm_guard.py` wrap model calls with caching, single-flight, cooldown and an hourly budget.
- `models/*` SQLAlchemy 2.0 models. Every tenant-owned table has `workspace_id`. Schema changes are additive and applied with `scripts/migrate.py` (nullable columns, new tables, RLS on).
- Storage is private (`integrations/storage`): local disk in development, Cloudflare R2 in production. Files are streamed to members; no public URLs.
- Case status changes go only through `case_service.set_status` and its transition map.

## Frontend (`frontend/`)
- App Router pages in `app/app/*` are thin; screens live in `components/<area>/*-view.tsx`.
- All server state goes through RTK Query in `store/api.ts` with cache tags. Mutations invalidate exactly what they change.
- Shared UI lives in `components/ui/*` (Dialog, Dropdown, Combobox, DatePicker, Field). Reuse them; don't add native `<select>`/`type="date"` inputs.
- Theme tokens are CSS variables in `app/globals.css`; components never hardcode colours that must change with the theme.

## Deployment
- API: Render (Python), Supabase Postgres via the session pooler, Cloudflare R2. Production refuses to start with unsafe settings (`Settings.production_problems`).
- Web: Cloudflare Workers via `@opennextjs/cloudflare` (`npm run deploy`). `NEXT_PUBLIC_*` values are compiled in from `frontend/.env.production`.

#[[file:OpsWarden_Documentation/ARCHITECTURE.md]]
