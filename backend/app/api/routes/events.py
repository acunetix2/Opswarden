"""Server-sent processing events per case (API-CONTRACTS section 8).

Authorization is checked once on connect (same rules as reading the case).
The stream relays audit events as they are written, with small, non-sensitive
payloads only: no document contents, prompts, or secrets.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import load_case
from app.core.permissions import Permission
from app.db import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.case import Case

router = APIRouter(tags=["events"])

# Contract event types, plus status changes so clients know when a run ends.
STREAMED = {
    "document.uploaded",
    "document.extraction.started",
    "document.extraction.completed",
    "document.extraction.failed",
    "comparison.started",
    "comparison.completed",
    "investigation.completed",
    "analysis.failed",
    "approval.requested",
    "approval.decided",
    "action.executed",
    "action.failed",
    "case.status_changed",
    "register.supplier_added",
    "register.supplier_updated",
    "register.purchase_order_added",
    "automation.completed",
}
_SAFE_KEYS = ("document_id", "document_type", "error_code", "finding_count", "status", "decision", "from", "to", "actions", "name", "po_number")


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _fetch(case_id: str, since: datetime) -> tuple[list[AuditEvent], str | None]:
    db = SessionLocal()
    try:
        rows = db.execute(
            select(AuditEvent)
            .where(AuditEvent.case_id == case_id, AuditEvent.created_at >= since)
            .order_by(AuditEvent.created_at)
            .limit(200)
        ).scalars().all()
        case = db.get(Case, case_id)
        db.expunge_all()
        return list(rows), case.status if case else None
    finally:
        db.close()


def _frame(event_id: str, event: str, data: dict) -> str:
    return f"id: {event_id}\nevent: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/cases/{case_id}/events")
async def case_events(
    request: Request,
    since: datetime | None = Query(default=None, description="Replay events from this time (ISO 8601)"),
    max_seconds: int = Query(default=300, ge=1, le=600),
    bundle: tuple = Depends(load_case),
) -> StreamingResponse:
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    case_id = case.id
    start = _utc(since) if since else datetime.now(timezone.utc) - timedelta(seconds=2)

    async def stream():
        seen: set[str] = set()
        cursor = start
        deadline = time.monotonic() + max_seconds
        last_beat = time.monotonic()
        yield "retry: 3000\n\n"
        while time.monotonic() < deadline:
            if await request.is_disconnected():
                return
            rows, status = await run_in_threadpool(_fetch, case_id, cursor)
            for e in rows:
                if e.id in seen:
                    continue
                seen.add(e.id)
                cursor = max(cursor, _utc(e.created_at))
                if e.event_type not in STREAMED:
                    continue
                payload = json.loads(e.event_payload_json) if e.event_payload_json else {}
                yield _frame(
                    e.id,
                    e.event_type,
                    {
                        "type": e.event_type,
                        "case_id": case_id,
                        "actor_type": e.actor_type,
                        "created_at": _utc(e.created_at).isoformat(),
                        "payload": {k: payload[k] for k in _SAFE_KEYS if k in payload},
                        "case_status": status,
                    },
                )
            if time.monotonic() - last_beat > 15:
                last_beat = time.monotonic()
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.75)
        yield _frame("end", "stream.end", {"reason": "timeout"})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
