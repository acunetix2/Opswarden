"""OCR replies that include field boxes (the shape that crashed analysis in production)."""
from __future__ import annotations

import json

from app.services import ocr_service


def _reply(payload: dict):
    return lambda *_args, **_kwargs: {"parts": [{"text": json.dumps(payload)}]}


def test_ocr_reply_with_boxes_is_read_and_boxes_are_kept(monkeypatch):
    payload = {
        "supplier_name": "Northstar Office Supplies",
        "document_number": "INV-8821",
        "purchase_order_reference": "PO-1048",
        "currency": "usd",
        "grand_total": "600.00",
        "line_items": [
            {"sku": "", "description": "", "quantity": None},  # dropped: empty row
            {"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"},
        ],
        "boxes": [
            {"field": "supplier_name", "page": 1, "box_2d": [40, 60, 70, 400]},
            {"field": "line_items[1].quantity", "page": 1, "box_2d": [540, 873, 550, 918]},
            {"field": "line_items[0].quantity", "page": 1, "box_2d": [500, 873, 510, 918]},  # dropped row
            {"field": "made_up_field", "page": 1, "box_2d": [1, 1, 2, 2]},
            {"field": "grand_total", "page": 1, "box_2d": [900, 10, 800, 20]},  # ymin > ymax
            "not a dict",
        ],
    }
    monkeypatch.setattr(ocr_service, "available", lambda: True)
    monkeypatch.setattr(ocr_service.gemini, "generate", _reply(payload))

    result = ocr_service.extract(b"%PDF-1.4", "application/pdf", "invoice")

    doc = result.document
    assert doc.supplier_name == "Northstar Office Supplies" and doc.currency == "USD"
    assert [li.sku for li in doc.line_items] == ["PROD-B"]
    # Row 1 in the model's numbering is row 0 after the empty row was dropped.
    assert doc.boxes == {
        "supplier_name": {"page": 1, "box": [40, 60, 70, 400]},
        "line_items[0].quantity": {"page": 1, "box": [540, 873, 550, 918]},
    }


def test_ocr_reply_without_boxes_still_works(monkeypatch):
    payload = {"document_number": "INV-1", "line_items": [{"sku": "A", "quantity": "1", "unit_price": "2.00", "line_total": "2.00"}]}
    monkeypatch.setattr(ocr_service, "available", lambda: True)
    monkeypatch.setattr(ocr_service.gemini, "generate", _reply(payload))
    doc = ocr_service.extract(b"%PDF-1.4", "application/pdf", "invoice").document
    assert doc.document_number == "INV-1" and doc.boxes == {}
