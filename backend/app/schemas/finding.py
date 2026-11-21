from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EvidenceOut(BaseModel):
    document_id: str | None
    field_path: str | None
    page_number: int | None
    snippet: str | None = None


class FindingOut(BaseModel):
    id: str
    rule_id: str
    finding_type: str
    severity: str
    title: str
    description: str
    expected_value: dict[str, Any] | None = None
    observed_value: dict[str, Any] | None = None
    impact_amount: str | None = None
    currency: str | None = None
    evidence: list[EvidenceOut] = Field(default_factory=list)
    status: str
    requires_review: bool = False


class FindingReviewRequest(BaseModel):
    decision: Literal["confirm", "dismiss", "needs_review", "reopen"]
    comment: str | None = None


class MoneyAmountOut(BaseModel):
    currency: str
    amount: str


class CaseSummaryOut(BaseModel):
    case_id: str
    analyzed: bool
    active_findings: int
    by_severity: dict[str, int]
    exposure: list[MoneyAmountOut]
    summary: str
    recommended_next_step: str


class WorkspaceFindingOut(BaseModel):
    id: str
    case_id: str
    case_number: str
    case_title: str
    supplier_name: str | None = None
    rule_id: str
    finding_type: str
    severity: str
    title: str
    impact_amount: str | None = None
    currency: str | None = None
    status: str
    created_at: datetime
