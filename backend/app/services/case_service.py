"""Case lifecycle helpers: numbering and controlled status transitions."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.workspace import Workspace
from app.services import audit_service

# Controlled transition map. Clients never set arbitrary status values.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"processing", "archived"},
    "processing": {"needs_review", "ready_for_approval", "failed", "resolved"},
    "needs_review": {"processing", "ready_for_approval", "resolved", "archived"},
    "ready_for_approval": {"processing", "in_progress", "needs_review", "resolved", "archived"},
    "in_progress": {"resolved", "failed", "needs_review"},
    "failed": {"processing", "needs_review", "archived"},
    # Reopening returns a case to review (or draft, if it was never analyzed).
    "resolved": {"archived", "needs_review"},
    "archived": {"draft", "needs_review"},
}


def next_case_number(db: Session, workspace: Workspace) -> str:
    workspace.case_seq = (workspace.case_seq or 0) + 1
    db.add(workspace)
    year = datetime.now(timezone.utc).year
    return f"OW-{year}-{workspace.case_seq:04d}"


def can_transition(current: str, target: str) -> bool:
    if current == target:
        return True
    return target in _ALLOWED_TRANSITIONS.get(current, set())


def set_status(
    db: Session,
    case: Case,
    target: str,
    *,
    actor_type: str = "system",
    actor_id: str | None = None,
) -> bool:
    """Apply a controlled transition and audit it (CASE-05). Returns False if not allowed."""
    if not can_transition(case.status, target):
        return False
    previous = case.status
    if previous == target:
        return True
    case.status = target
    if target == "resolved":
        case.resolved_at = datetime.now(timezone.utc)
    elif previous in ("resolved", "archived") and target in ("draft", "needs_review"):
        case.resolved_at = None  # reopened
    db.add(case)
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="case.status_changed",
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"from": previous, "to": target},
        commit=False,
    )
    return True
