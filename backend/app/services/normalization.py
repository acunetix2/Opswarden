"""Deterministic normalization utilities for comparison.

No floating point for money or quantities. All parsing goes through Decimal.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation


def normalize_text(value: str | None) -> str:
    """Lowercase, collapse whitespace, strip punctuation noise for matching."""
    if value is None:
        return ""
    v = value.strip().lower()
    v = re.sub(r"\s+", " ", v)
    return v


def normalize_reference(value: str | None) -> str:
    """Normalize an identifier/reference: uppercase, remove separators."""
    if value is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", value.strip().lower()).upper()


def normalize_sku(value: str | None) -> str:
    return normalize_reference(value)


def parse_decimal(value: str | int | float | Decimal | None) -> Decimal | None:
    """Parse a money/quantity value into Decimal, or None if not parseable.

    Accepts strings like '1,234.50', '$12.00', '40'. Rejects empty/None.
    Never uses float for the final value.
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        # Route through str to avoid binary float artefacts.
        return Decimal(str(value))
    s = str(value).strip()
    if not s:
        return None
    # Strip currency symbols and spaces, keep digits, separators, sign.
    s = re.sub(r"[^0-9.,\-]", "", s)
    if not s:
        return None
    # Handle thousands separators: if both , and . present, assume , is thousands.
    if "," in s and "." in s:
        s = s.replace(",", "")
    elif "," in s and "." not in s:
        # Ambiguous: treat comma as decimal only if it looks like one (e.g. 12,50)
        if re.match(r"^-?\d{1,3}(,\d{3})+$", s):
            s = s.replace(",", "")  # pure thousands grouping
        else:
            s = s.replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def description_similarity(a: str | None, b: str | None) -> Decimal:
    """Token-overlap similarity in [0, 1] as a Decimal. Deterministic.

    Used only to *propose* candidate matches, never as arithmetic authority.
    """
    ta = set(normalize_text(a).split())
    tb = set(normalize_text(b).split())
    if not ta or not tb:
        return Decimal("0")
    inter = len(ta & tb)
    union = len(ta | tb)
    if union == 0:
        return Decimal("0")
    return (Decimal(inter) / Decimal(union)).quantize(Decimal("0.0001"))
