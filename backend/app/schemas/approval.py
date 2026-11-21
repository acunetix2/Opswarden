from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


class EmailDraftOut(BaseModel):
    recommendation_id: str
    type: str
    status: str
    subject: str
    body: str
    recipient: str | None = None
    requires_human_review: bool = True
    ai_assisted: bool = False
    model: str | None = None
    # Set when a model is configured but its rewrite wasn't used.
    fallback_reason: str | None = None


class RequestApprovalRequest(BaseModel):
    recipient: EmailStr | None = None
    subject: str | None = None
    body: str | None = None


class RequestApprovalResponse(BaseModel):
    approval_id: str
    status: str
    payload_hash: str


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = None


class ApprovalOut(BaseModel):
    id: str
    case_id: str
    case_number: str | None = None
    case_title: str | None = None
    supplier_name: str | None = None
    rationale: str | None = None
    comment: str | None = None
    requested_by_name: str | None = None
    reviewed_by_name: str | None = None
    action_type: str
    status: str
    subject: str | None = None
    body: str | None = None
    recipient: str | None = None
    requested_by: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    executed_at: datetime | None = None
    provider_reference: str | None = None
    created_at: datetime


class ExecuteResponse(BaseModel):
    approval_id: str
    status: str
    provider_reference: str | None = None
    export: dict | None = None
