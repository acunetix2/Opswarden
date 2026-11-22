from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MoneyAmount(BaseModel):
    currency: str
    amount: str  # decimal string, never float


class OverviewMetrics(BaseModel):
    open_cases: int
    open_cases_created_in_period: int
    needs_review: int
    pending_approvals: int
    open_findings: int
    findings_in_period: int
    resolved_in_period: int
    exposure: list[MoneyAmount]
    # Value settled in the business's favour, per currency.
    recovered_in_period: list[MoneyAmount] = []
    recovered_total: list[MoneyAmount] = []


class SeriesPoint(BaseModel):
    date: str  # YYYY-MM-DD
    created: int
    resolved: int


class AttentionItem(BaseModel):
    kind: str  # approval | review | prepare
    title: str
    case_id: str
    case_number: str
    supplier_name: str | None
    reference: str | None
    approval_id: str | None = None


class RecentCase(BaseModel):
    id: str
    case_number: str
    title: str
    supplier_name: str | None
    status: str
    finding_count: int
    exposure: MoneyAmount | None
    created_at: datetime
    updated_at: datetime


class OverviewOut(BaseModel):
    workspace_name: str
    period_days: int
    metrics: OverviewMetrics
    series: list[SeriesPoint]
    attention: list[AttentionItem]
    recent_cases: list[RecentCase]


class MemberOut(BaseModel):
    user_id: str
    full_name: str
    email: str
    role: str
    joined_at: datetime


class WorkspaceSettingsOut(BaseModel):
    workspace_id: str
    workspace_name: str
    your_role: str
    price_tolerance: str
    quantity_tolerance: str
    reviewers_can_approve: bool
    policy_updated_at: datetime | None = None
    policy_updated_by_name: str | None = None
    max_upload_bytes: int
    accepted_extensions: list[str]
    ocr_available: bool
    tts_available: bool = False
    stt_available: bool = False
    email_configured: bool
    # Where uploaded documents are stored: "r2", "s3" or "local" (server disk).
    storage_backend: str = "local"
    email_sender: str | None = None
    llm_configured: bool
    llm_provider: str | None
    approval_required: bool = True
    # Automation. Nothing reaches a supplier without an approval, whatever these say.
    auto_register: bool = True
    auto_draft_letters: bool = True
    auto_resolve_clean: bool = True
    notify_reviewers: bool = True
    send_on_approval: bool = True
    follow_up_reminders: bool = True
    record_credit_notes: bool = True
    follow_up_days: int = 5
    # Invoices by email: the workspace's address, or None when the inbox is off or not set up.
    inbound_address: str | None = None
    inbound_available: bool = False


class WorkspaceSettingsUpdate(BaseModel):
    workspace_name: str | None = Field(default=None, max_length=200)
    # Decimal strings; validated server-side.
    price_tolerance: str | None = Field(default=None, max_length=32)
    quantity_tolerance: str | None = Field(default=None, max_length=32)
    reviewers_can_approve: bool | None = None
    auto_register: bool | None = None
    auto_draft_letters: bool | None = None
    auto_resolve_clean: bool | None = None
    notify_reviewers: bool | None = None
    send_on_approval: bool | None = None
    follow_up_reminders: bool | None = None
    record_credit_notes: bool | None = None
    follow_up_days: int | None = Field(default=None, ge=1, le=60)


class NotificationOut(BaseModel):
    id: str
    event_type: str
    case_id: str | None
    case_number: str | None
    actor_type: str
    actor_name: str | None
    detail: dict
    created_at: datetime
    unread: bool


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class SupplierOut(BaseModel):
    name: str
    total_cases: int
    open_cases: int
    resolved_cases: int
    active_findings: int
    exposure: list[MoneyAmount]
    last_activity_at: datetime
    latest_case_id: str
