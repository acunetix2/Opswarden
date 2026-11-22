"""Upload validation shared by case uploads, smart intake and the email inbox.

The extension decides the type; the file's first bytes must match it. Files are
never trusted for anything else.
"""
from __future__ import annotations

import re

ALLOWED_TYPES = {"purchase_order", "invoice", "delivery_receipt"}

# (mime, magic-signature-prefixes) accepted for the MVP.
SIGNATURES = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "text/plain": [],  # text fixtures: no signature requirement
    "application/json": [],
}


class UnsupportedFile(Exception):
    pass


def detect_mime(filename: str, declared_mime: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        mime = "application/pdf"
    elif name.endswith(".png"):
        mime = "image/png"
    elif name.endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    elif name.endswith(".json"):
        mime = "application/json"
    elif name.endswith(".txt"):
        mime = "text/plain"
    else:
        # Unknown extension: trust the declared type only if the bytes can prove it.
        mime = declared_mime if SIGNATURES.get(declared_mime) else ""

    if mime not in SIGNATURES:
        raise UnsupportedFile()
    sigs = SIGNATURES[mime]
    if sigs and not any(data.startswith(s) for s in sigs):
        raise UnsupportedFile()
    return mime


def guess_document_type(filename: str, hint: str = "") -> str:
    """First guess from the file name (and an email subject). Mirrors frontend/lib/intake.ts."""
    text = re.sub(r"[^a-z0-9]+", " ", f"{filename} {hint}".lower())
    if re.search(r"\b(receipt|grn|delivery|delivered|packing|dn|pod)\b", text):
        return "delivery_receipt"
    if re.search(r"\b(po|purchase|order)\b", text) and not re.search(r"\binv(oice)?\b", text):
        return "purchase_order"
    return "invoice"


def looks_like_credit_note(*texts: str | None) -> bool:
    joined = " ".join(t or "" for t in texts).lower()
    return bool(re.search(r"credit[\s_-]*(note|memo)|\bcn[\s_-]?\d", joined))
