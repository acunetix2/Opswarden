from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, load_case, workspace_context
from app.api.errors import forbidden
from app.core.permissions import Permission, Role
from app.db import get_db
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.user import User
from app.schemas.activity import ActivityEventOut

router = APIRouter(tags=["activity"])


def _serialize(db: Session, rows: list[AuditEvent]) -> list[ActivityEventOut]:
    actor_ids = {e.actor_id for e in rows if e.actor_id}
    case_ids = {e.case_id for e in rows if e.case_id}
    names: dict[str, str] = {}
    if actor_ids:
        for u in db.execute(select(User).where(User.id.in_(actor_ids))).scalars():
            names[u.id] = u.full_name or u.email
    numbers: dict[str, str] = {}
    if case_ids:
        for c in db.execute(select(Case).where(Case.id.in_(case_ids))).scalars():
            numbers[c.id] = c.case_number

    out = []
    for e in rows:
        payload = None
        if e.event_payload_json:
            try:
                payload = json.loads(e.event_payload_json)
            except json.JSONDecodeError:
                payload = None
        out.append(
            ActivityEventOut(
                id=e.id,
                case_id=e.case_id,
                case_number=numbers.get(e.case_id) if e.case_id else None,
                actor_type=e.actor_type,
                actor_id=e.actor_id,
                actor_name=names.get(e.actor_id) if e.actor_id else None,
                event_type=e.event_type,
                payload=payload,
                created_at=e.created_at,
            )
        )
    return out


@router.get("/cases/{case_id}/activity", response_model=list[ActivityEventOut])
def case_activity(
    bundle: tuple = Depends(load_case),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
) -> list[ActivityEventOut]:
    case, ctx = bundle
    ctx.require(Permission.READ_CASE)
    rows = db.execute(
        select(AuditEvent)
        .where(AuditEvent.case_id == case.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    ).scalars().all()
    return _serialize(db, list(rows))


@router.get("/workspaces/{workspace_id}/activity", response_model=list[ActivityEventOut])
def workspace_activity(
    workspace_id: str,
    limit: int = Query(default=200, le=500),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[ActivityEventOut]:
    # Workspace-wide activity is for administrators.
    if ctx.role != Role.admin.value:
        raise forbidden("Workspace activity is restricted to administrators.")
    rows = db.execute(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == workspace_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    ).scalars().all()
    return _serialize(db, list(rows))
