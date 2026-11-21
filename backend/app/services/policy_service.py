"""Workspace policy: comparison tolerances and approval rules.

A workspace without a stored policy uses the server defaults from settings.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.access import WorkspacePolicy


@dataclass(frozen=True)
class Policy:
    price_tolerance: Decimal
    quantity_tolerance: Decimal
    reviewers_can_approve: bool
    updated_by: str | None = None
    updated_at: datetime | None = None


def get_policy(db: Session, workspace_id: str) -> Policy:
    row = db.get(WorkspacePolicy, workspace_id)
    if row is None:
        return Policy(
            price_tolerance=settings.price_tolerance,
            quantity_tolerance=settings.quantity_tolerance,
            reviewers_can_approve=True,
        )
    return Policy(
        price_tolerance=Decimal(row.price_tolerance),
        quantity_tolerance=Decimal(row.quantity_tolerance),
        reviewers_can_approve=row.reviewers_can_approve,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


def save_policy(
    db: Session,
    workspace_id: str,
    *,
    price_tolerance: Decimal,
    quantity_tolerance: Decimal,
    reviewers_can_approve: bool,
    updated_by: str,
) -> None:
    row = db.get(WorkspacePolicy, workspace_id)
    if row is None:
        row = WorkspacePolicy(workspace_id=workspace_id, price_tolerance="0", quantity_tolerance="0")
        db.add(row)
    row.price_tolerance = str(price_tolerance)
    row.quantity_tolerance = str(quantity_tolerance)
    row.reviewers_can_approve = reviewers_can_approve
    row.updated_by = updated_by


def may_decide_external_action(db: Session, workspace_id: str, role: str) -> bool:
    """Admins always may; reviewers only when the workspace policy permits."""
    if role == "admin":
        return True
    if role == "reviewer":
        return get_policy(db, workspace_id).reviewers_can_approve
    return False
