"""Recovery tracking: how a case was closed and how much value came back.

Plain Decimal arithmetic. No model is involved in recording or summing outcomes.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from app.services.normalization import parse_decimal

# Outcome -> whether it can carry a recovered amount.
OUTCOMES: dict[str, bool] = {
    "recovered": True,
    "corrected_invoice": True,
    "no_discrepancy": False,
    "written_off": False,
}

CENT = Decimal("0.01")
_AMOUNT_RE = re.compile(r"(\d{1,3}(,\d{3})+|\d+)(\.\d{1,4})?")
MAX_AMOUNT = Decimal("100000000000000")  # fits Numeric(18,4)


class InvalidAmount(ValueError):
    pass


def parse_recovered_amount(outcome: str, raw: str | None) -> Decimal | None:
    """Validate the amount for an outcome. Returns None when the outcome recovers nothing."""
    if not OUTCOMES.get(outcome):
        return None
    if raw is None or str(raw).strip() == "":
        return None
    text = str(raw).strip()
    if text.startswith("-"):
        raise InvalidAmount("The recovered amount can't be negative.")
    # Typed by a person, so be strict: digits, optional thousands commas, optional decimals.
    if not _AMOUNT_RE.fullmatch(text):
        raise InvalidAmount("Enter the recovered amount as a number, for example 1250.00.")
    value = parse_decimal(text)
    if value is None or not value.is_finite():
        raise InvalidAmount("Enter the recovered amount as a number, for example 1250.00.")
    if value < 0:
        raise InvalidAmount("The recovered amount can't be negative.")
    if value >= MAX_AMOUNT:
        raise InvalidAmount("The recovered amount is too large.")
    return value.quantize(CENT)


def sum_recovered(rows: Iterable[tuple[str, Decimal | None]]) -> dict[str, Decimal]:
    """Sum (currency, amount) pairs per currency, skipping empty amounts."""
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for currency, amount in rows:
        if amount is None:
            continue
        totals[currency] += Decimal(str(amount))
    return dict(totals)
