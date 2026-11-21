"""Document text extraction and structured-field mapping.

For the MVP this handles:
  - Digital PDF text extraction (pypdf).
  - Plain-text / JSON sidecar documents (demo fixtures).
  - A deterministic pattern-based parser that maps text into the versioned
    StructuredDocument schema.

Uncertain or missing fields are marked for review, never invented. Document
text is treated as untrusted data and is never executed or interpreted as
instructions.
"""
from __future__ import annotations

import io
import json
import re
from decimal import Decimal

from app.services.doc_schema import SCHEMA_VERSION, LineItem, StructuredDocument
from app.services.normalization import parse_decimal

_LOW_CONFIDENCE = 0.4
_HIGH_CONFIDENCE = 0.95


class ExtractionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def extract_text(data: bytes, mime_type: str, filename: str) -> str:
    """Return best-effort plain text from the uploaded document."""
    name = filename.lower()
    if mime_type == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf_text(data)
    if mime_type.startswith("text/") or name.endswith((".txt", ".json")):
        return data.decode("utf-8", errors="replace")
    if mime_type in ("image/png", "image/jpeg") or name.endswith((".png", ".jpg", ".jpeg")):
        # Images have no text layer; extract_document() routes them to OCR.
        # Surface a recoverable failure rather than inventing content.
        raise ExtractionError(
            "OCR_UNAVAILABLE",
            "Images need OCR. Set GEMINI_API_KEY, or upload a digital PDF or text document.",
        )
    # Fall back to decoding; parser will flag low confidence.
    return data.decode("utf-8", errors="replace")


def _extract_pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover
        raise ExtractionError("PDF_LIB_MISSING", "PDF support unavailable") from exc
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [(p.extract_text() or "") for p in reader.pages]
        text = "\n".join(pages)
    except Exception as exc:
        raise ExtractionError("PDF_PARSE_FAILED", "Could not read the PDF") from exc
    if not text.strip():
        raise ExtractionError(
            "NO_TEXT_LAYER",
            "The PDF has no extractable text layer (it may be a scan). OCR is unavailable in this build.",
        )
    return text


_IMAGE_TYPES = {"image/png", "image/jpeg"}


def extract_document(
    data: bytes, mime_type: str, filename: str, document_type: str
) -> tuple[StructuredDocument, dict[str, float], str, str]:
    """Full extraction for one upload. Returns (document, confidences, provider, model).

    - Images and PDFs without a text layer go to vision OCR.
    - Digital PDFs use the text parser; if it finds no line items (unfamiliar
      layout), vision OCR reads the PDF instead.
    - JSON and text exports are parsed directly.
    """
    from app.services import ocr_service

    name = filename.lower()
    is_image = mime_type in _IMAGE_TYPES or name.endswith((".png", ".jpg", ".jpeg"))
    is_pdf = mime_type == "application/pdf" or name.endswith(".pdf")

    def ocr(mime: str) -> tuple[StructuredDocument, dict[str, float], str, str]:
        try:
            result = ocr_service.extract(data, mime, document_type)
        except ocr_service.OCRError as exc:
            raise ExtractionError(exc.code, str(exc)) from exc
        return result.document, result.confidence, result.provider, result.model

    if is_image:
        return ocr("image/png" if name.endswith(".png") or mime_type == "image/png" else "image/jpeg")

    if is_pdf:
        try:
            text = _extract_pdf_text(data)
        except ExtractionError as exc:
            if exc.code == "NO_TEXT_LAYER" and ocr_service.available():
                return ocr("application/pdf")
            raise
        doc, conf = parse_structured(text, document_type)
        if not doc.line_items and ocr_service.available():
            try:
                return ocr("application/pdf")
            except ExtractionError:
                pass  # keep the text parser's partial result; fields are already marked for review
        return doc, conf, "builtin", "text-parser"

    doc, conf = parse_structured(extract_text(data, mime_type, filename), document_type)
    return doc, conf, "builtin", "text-parser"


def parse_structured(text: str, document_type: str) -> tuple[StructuredDocument, dict[str, float]]:
    """Map raw text into the structured schema.

    Returns the document plus a per-field-path confidence map. A JSON fixture
    (``__OPSWARDEN_JSON__`` marker or a bare JSON object) is honored directly so
    demo fixtures extract deterministically.
    """
    fixture = _try_json_fixture(text, document_type)
    if fixture is not None:
        doc, conf = fixture
        return doc, conf

    return _parse_freeform(text, document_type)


def _try_json_fixture(text: str, document_type: str) -> tuple[StructuredDocument, dict[str, float]] | None:
    stripped = text.strip()
    marker = "__OPSWARDEN_JSON__"
    if marker in stripped:
        stripped = stripped.split(marker, 1)[1].strip()
    if not stripped.startswith("{"):
        return None
    try:
        raw = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    raw.setdefault("schema_version", SCHEMA_VERSION)
    raw.setdefault("document_type", document_type)
    try:
        doc = StructuredDocument.model_validate(raw)
    except Exception:
        return None
    conf: dict[str, float] = {}
    for field_name in ("supplier_name", "document_number", "purchase_order_reference", "currency", "grand_total"):
        if getattr(doc, field_name, None) is not None:
            conf[field_name] = _HIGH_CONFIDENCE
    for i, _ in enumerate(doc.line_items):
        conf[f"line_items[{i}].quantity"] = _HIGH_CONFIDENCE
        conf[f"line_items[{i}].unit_price"] = _HIGH_CONFIDENCE
    return doc, conf


_FIELD_PATTERNS = {
    "supplier_name": r"(?:supplier|vendor)\s*(?:name)?\s*[:\-]\s*(.+)",
    "document_number": r"(?:invoice|po|order|receipt)\s*(?:no|number|#)?\s*[:\-]\s*([A-Za-z0-9\-]+)",
    "purchase_order_reference": r"(?:po|purchase order)\s*(?:ref|reference|no|number|#)?\s*[:\-]\s*([A-Za-z0-9\-]+)",
    "currency": r"currency\s*[:\-]\s*([A-Za-z]{3})",
    "subtotal": r"subtotal\s*[:\-]?\s*([0-9.,]+)",
    "tax": r"(?:tax|vat)\s*[:\-]?\s*([0-9.,]+)",
    "grand_total": r"(?:grand\s*total|total\s*due|total)\s*[:\-]?\s*([0-9.,]+)",
}


def _parse_freeform(text: str, document_type: str) -> tuple[StructuredDocument, dict[str, float]]:
    conf: dict[str, float] = {}
    values: dict[str, str] = {}
    for field_name, pat in _FIELD_PATTERNS.items():
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            values[field_name] = m.group(1).strip()
            conf[field_name] = _LOW_CONFIDENCE  # pattern-extracted: needs review

    line_items = _parse_line_items(text, document_type, conf)

    doc = StructuredDocument(
        schema_version=SCHEMA_VERSION,
        document_type=document_type,  # type: ignore[arg-type]
        supplier_name=values.get("supplier_name"),
        document_number=values.get("document_number"),
        purchase_order_reference=values.get("purchase_order_reference"),
        currency=(values.get("currency") or "").upper() or None,
        subtotal=values.get("subtotal"),
        tax=values.get("tax"),
        grand_total=values.get("grand_total"),
        line_items=line_items,
    )
    return doc, conf


def _parse_line_items(text: str, document_type: str, conf: dict[str, float]) -> list[LineItem]:
    """Parse simple tabular lines: SKU | description | qty | unit_price | total."""
    items: list[LineItem] = []
    for line in text.splitlines():
        if "|" not in line:
            continue
        cols = [c.strip() for c in line.split("|")]
        # Heuristic: need at least description + quantity.
        nums = [c for c in cols if parse_decimal(c) is not None]
        if len(nums) < 1 or all(parse_decimal(c) is None for c in cols):
            continue
        sku = cols[0] if cols and parse_decimal(cols[0]) is None else None
        desc = next((c for c in cols[1:] if parse_decimal(c) is None), None)
        qty = nums[0] if nums else None
        price = nums[1] if len(nums) > 1 else None
        total = nums[2] if len(nums) > 2 else None
        idx = len(items)
        item = LineItem(
            sku=sku,
            description=desc,
            quantity=qty if document_type != "delivery_receipt" else None,
            received_quantity=qty if document_type == "delivery_receipt" else None,
            unit_price=price,
            line_total=total,
        )
        items.append(item)
        conf[f"line_items[{idx}].quantity"] = _LOW_CONFIDENCE
        if price is not None:
            conf[f"line_items[{idx}].unit_price"] = _LOW_CONFIDENCE
    return items
