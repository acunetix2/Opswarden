"""Supplier scorecard: how often a supplier short-ships or overbills, and what came back.

Counts are per case (a case with three short lines counts once as a short shipment).
Dismissed findings don't count: a person decided they weren't real.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal

SHORT_SHIP_RULES = {"INVOICE_QTY_GT_RECEIVED", "RECEIVED_QTY_LT_ORDERED"}
OVERBILL_RULES = {"UNIT_PRICE_MISMATCH", "PRICE_ABOVE_HISTORY", "LINE_TOTAL_MISMATCH", "TOTAL_MISMATCH", "DUPLICATE_INVOICE", "INVOICE_QTY_NE_ORDERED"}
_COUNTED = ("open", "confirmed", "needs_review")
_CENT = Decimal("0.01")


@dataclass
class CaseFacts:
    case_id: str
    case_number: str
    status: str
    currency: str
    analyzed: bool
    rules: set[str]                  # rules of findings that weren't dismissed
    open_exposure: Decimal           # active findings, case currency
    recovered: Decimal | None
    outcome: str | None
    letter_sent_at: datetime | None
    replied_at: datetime | None
    updated_at: datetime


@dataclass
class Scorecard:
    cases: int = 0
    analyzed: int = 0
    with_issues: int = 0
    short_shipments: int = 0
    overbilling: int = 0
    issue_rate: Decimal | None = None          # percent of analyzed cases with an issue
    open_exposure: dict[str, Decimal] = field(default_factory=dict)
    recovered: dict[str, Decimal] = field(default_factory=dict)
    letters_sent: int = 0
    replies: int = 0
    average_reply_days: Decimal | None = None
    rule_counts: dict[str, int] = field(default_factory=dict)


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def score(facts: list[CaseFacts]) -> Scorecard:
    s = Scorecard(cases=len(facts))
    exposure: dict[str, Decimal] = defaultdict(Decimal)
    recovered: dict[str, Decimal] = defaultdict(Decimal)
    rule_counts: dict[str, int] = defaultdict(int)
    reply_days: list[Decimal] = []
    for f in facts:
        if f.analyzed:
            s.analyzed += 1
        issue_rules = f.rules - {"MISSING_DOCUMENT", "AMBIGUOUS_MATCH"}
        if f.analyzed and issue_rules:
            s.with_issues += 1
        if f.rules & SHORT_SHIP_RULES:
            s.short_shipments += 1
        if f.rules & OVERBILL_RULES:
            s.overbilling += 1
        for r in issue_rules:
            rule_counts[r] += 1
        if f.status not in ("resolved", "archived") and f.open_exposure > 0:
            exposure[f.currency] += f.open_exposure
        if f.status == "resolved" and f.recovered:
            recovered[f.currency] += f.recovered
        if f.letter_sent_at:
            s.letters_sent += 1
            if f.replied_at and _utc(f.replied_at) >= _utc(f.letter_sent_at):
                s.replies += 1
                seconds = Decimal(int((_utc(f.replied_at) - _utc(f.letter_sent_at)).total_seconds()))
                reply_days.append(seconds / Decimal(86400))
    if s.analyzed:
        s.issue_rate = (Decimal(s.with_issues) * 100 / s.analyzed).quantize(Decimal("0.1"))
    if reply_days:
        s.average_reply_days = (sum(reply_days, Decimal(0)) / len(reply_days)).quantize(Decimal("0.1"))
    s.open_exposure = {k: v.quantize(_CENT) for k, v in exposure.items() if v > 0}
    s.recovered = {k: v.quantize(_CENT) for k, v in recovered.items() if v > 0}
    s.rule_counts = dict(sorted(rule_counts.items(), key=lambda kv: (-kv[1], kv[0])))
    return s
