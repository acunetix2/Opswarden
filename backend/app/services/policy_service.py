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


AUTOMATION_FLAGS = (
    "auto_register",
    "auto_draft_letters",
    "auto_resolve_clean",
    "notify_reviewers",
    "send_on_approval",
    "follow_up_reminders",
    "record_credit_notes",
)
DEFAULT_FOLLOW_UP_DAYS = 5


@dataclass(frozen=True)
class Automation:
    """What OpsWarden does on its own. Every switch defaults to on; none of them
    sends anything to a supplier without a person's approval."""
    auto_register: bool = True        # save suppliers, POs and document numbers read from documents
    auto_draft_letters: bool = True   # draft the supplier letter and queue it for approval after analysis
    auto_resolve_clean: bool = True   # close cases where all three documents agree
    notify_reviewers: bool = True     # email reviewers when a letter or a review is waiting
    send_on_approval: bool = True     # approving a letter sends it straight away
    follow_up_reminders: bool = True  # draft a reminder when the supplier hasn't replied
    record_credit_notes: bool = True  # a credit note in the supplier's reply closes the case as recovered
    follow_up_days: int = DEFAULT_FOLLOW_UP_DAYS


def get_automation(db: Session, workspace_id: str) -> Automation:
    row = db.get(WorkspacePolicy, workspace_id)
    if row is None:
        return Automation()
    flags = {f: (True if getattr(row, f) is None else bool(getattr(row, f))) for f in AUTOMATION_FLAGS}
    return Automation(**flags, follow_up_days=row.follow_up_days or DEFAULT_FOLLOW_UP_DAYS)


def save_automation(db: Session, workspace_id: str, flags: dict[str, bool], updated_by: str) -> None:
    row = db.get(WorkspacePolicy, workspace_id)
    if row is None:
        row = WorkspacePolicy(
            workspace_id=workspace_id,
            price_tolerance=str(settings.price_tolerance),
            quantity_tolerance=str(settings.quantity_tolerance),
            reviewers_can_approve=True,
        )
        db.add(row)
    for name, value in flags.items():
        if name in AUTOMATION_FLAGS:
            setattr(row, name, bool(value))
        elif name == "follow_up_days":
            setattr(row, name, int(value))
    row.updated_by = updated_by


def may_decide_external_action(db: Session, workspace_id: str, role: str) -> bool:
    """Admins always may; reviewers only when the workspace policy permits."""
    if role == "admin":
        return True
    if role == "reviewer":
        return get_policy(db, workspace_id).reviewers_can_approve
    return False
