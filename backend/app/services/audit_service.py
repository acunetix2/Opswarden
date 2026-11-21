"""Audit event service. Records meaningful actions without secrets/contents."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def record_event(
    db: Session,
    *,
    workspace_id: str,
    event_type: str,
    actor_type: str,
    actor_id: str | None = None,
    case_id: str | None = None,
    payload: dict[str, Any] | None = None,
    correlation_id: str | None = None,
    commit: bool = True,
) -> AuditEvent:
    event = AuditEvent(
        workspace_id=workspace_id,
        case_id=case_id,
        actor_type=actor_type,
        actor_id=actor_id,
        event_type=event_type,
        event_payload_json=json.dumps(payload) if payload is not None else None,
        correlation_id=correlation_id,
    )
    db.add(event)
    if commit:
        db.commit()
    return event
