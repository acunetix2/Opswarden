"""Show what OpsWarden extracts from real documents, before uploading them.

Usage (from backend/):
  .venv\\Scripts\\python.exe scripts\\extract_report.py invoice path\\to\\invoice.pdf [more files...]
  document type: purchase_order | invoice | delivery_receipt

Uses the same extraction path as the analysis (text parser, then OCR for scans,
photos and unfamiliar PDF layouts). Fields under 60% confidence are the ones a
person will be asked to check.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.extraction_service import ExtractionError, extract_document  # noqa: E402

_MIME = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".json": "application/json", ".txt": "text/plain"}


def report(document_type: str, path: Path) -> None:
    print(f"\n=== {path.name} ({document_type})")
    try:
        doc, conf, provider, model = extract_document(path.read_bytes(), _MIME.get(path.suffix.lower(), ""), path.name, document_type)
    except ExtractionError as exc:
        print(f"  FAILED [{exc.code}] {exc}")
        return
    print(f"  method: {provider}/{model}")

    def show(field_path: str, value) -> None:
        if value is None:
            return
        c = conf.get(field_path)
        flag = "CHECK" if c is not None and c < 0.6 else "ok"
        print(f"  {field_path:32} {str(value):28} {'' if c is None else f'{c:.0%}':>5}  {flag}")

    for name in ("supplier_name", "document_number", "document_date", "purchase_order_reference", "currency", "subtotal", "tax", "grand_total"):
        show(name, getattr(doc, name))
    if not doc.line_items:
        print("  (no line items found)")
    for i, li in enumerate(doc.line_items):
        for key in ("sku", "description", "quantity", "received_quantity", "unit_price", "line_total"):
            show(f"line_items[{i}].{key}", getattr(li, key))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    document_type = sys.argv[1]
    for p in sys.argv[2:]:
        report(document_type, Path(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
