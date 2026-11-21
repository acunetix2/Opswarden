from __future__ import annotations

from decimal import Decimal

from app.services.comparison_service import (
    ComparisonConfig,
    DocumentRef,
    run_comparison,
)
from app.services.doc_schema import LineItem, StructuredDocument

CONFIG = ComparisonConfig(price_tolerance=Decimal("0.01"), quantity_tolerance=Decimal("0"))


def _doc(dtype, items, **kw):
    return DocumentRef(document_id=f"{dtype}-id", doc=StructuredDocument(document_type=dtype, line_items=items, **kw))


def _rules(findings):
    return {f.rule_id for f in findings}


def test_seeded_quantity_discrepancy():
    """PO 50 / received 40 / invoiced 50 -> invoice exceeds delivered."""
    po = _doc("purchase_order", [LineItem(sku="PROD-B", quantity="50", unit_price="12.00")], supplier_name="Northstar", document_number="PO-1048", currency="USD")
    delivery = _doc("delivery_receipt", [LineItem(sku="PROD-B", received_quantity="40")], supplier_name="Northstar", purchase_order_reference="PO-1048")
    invoice = _doc("invoice", [LineItem(sku="PROD-B", quantity="50", unit_price="12.00", line_total="600.00")], supplier_name="Northstar", document_number="INV-8821", purchase_order_reference="PO-1048", currency="USD", subtotal="600.00", tax="0.00", grand_total="600.00")

    findings = run_comparison(po, invoice, delivery, CONFIG)
    rules = _rules(findings)
    assert "INVOICE_QTY_GT_RECEIVED" in rules
    assert "RECEIVED_QTY_LT_ORDERED" in rules
    over = next(f for f in findings if f.rule_id == "INVOICE_QTY_GT_RECEIVED")
    assert over.impact_amount == Decimal("120.00")  # 10 excess units x 12.00
    # No false positives on price or totals.
    assert "UNIT_PRICE_MISMATCH" not in rules
    assert "TOTAL_MISMATCH" not in rules


def test_perfect_match_has_no_quantity_findings():
    po = _doc("purchase_order", [LineItem(sku="A", quantity="10", unit_price="5.00")], supplier_name="Acme", currency="USD")
    delivery = _doc("delivery_receipt", [LineItem(sku="A", received_quantity="10")], supplier_name="Acme")
    invoice = _doc("invoice", [LineItem(sku="A", quantity="10", unit_price="5.00", line_total="50.00")], supplier_name="Acme", purchase_order_reference="", currency="USD", subtotal="50.00", tax="0.00", grand_total="50.00")
    findings = run_comparison(po, invoice, delivery, CONFIG)
    qty = [f for f in findings if f.finding_type == "quantity_mismatch"]
    assert qty == []


def test_unit_price_mismatch_and_impact():
    po = _doc("purchase_order", [LineItem(sku="A", quantity="10", unit_price="5.00")], supplier_name="Acme", currency="USD")
    invoice = _doc("invoice", [LineItem(sku="A", quantity="10", unit_price="6.00", line_total="60.00")], supplier_name="Acme", currency="USD", subtotal="60.00", tax="0.00", grand_total="60.00")
    findings = run_comparison(po, invoice, None, CONFIG)
    price = [f for f in findings if f.rule_id == "UNIT_PRICE_MISMATCH"]
    assert len(price) == 1
    assert price[0].impact_amount == Decimal("10.00")  # (6-5)*10


def test_total_mismatch_detected():
    invoice = _doc("invoice", [LineItem(sku="A", quantity="2", unit_price="5.00", line_total="10.00")], supplier_name="Acme", currency="USD", subtotal="10.00", tax="2.00", grand_total="99.00")
    findings = run_comparison(None, invoice, None, CONFIG)
    assert "TOTAL_MISMATCH" in _rules(findings)


def test_supplier_mismatch():
    po = _doc("purchase_order", [LineItem(sku="A", quantity="1")], supplier_name="Acme", currency="USD")
    invoice = _doc("invoice", [LineItem(sku="A", quantity="1")], supplier_name="Globex", currency="USD")
    findings = run_comparison(po, invoice, None, CONFIG)
    assert "SUPPLIER_MISMATCH" in _rules(findings)


def test_duplicate_invoice():
    invoice = _doc("invoice", [LineItem(sku="A", quantity="1")], supplier_name="Acme", document_number="INV-100", currency="USD")
    findings = run_comparison(None, invoice, None, CONFIG, existing_invoice_numbers={"INV100"})
    assert "DUPLICATE_INVOICE" in _rules(findings)


def test_currency_mismatch():
    po = _doc("purchase_order", [LineItem(sku="A", quantity="1")], supplier_name="Acme", currency="USD")
    invoice = _doc("invoice", [LineItem(sku="A", quantity="1")], supplier_name="Acme", currency="EUR")
    findings = run_comparison(po, invoice, None, CONFIG)
    assert "CURRENCY_MISMATCH" in _rules(findings)


def test_reordering_line_items_is_stable():
    po = _doc("purchase_order", [LineItem(sku="A", quantity="5", unit_price="1.00"), LineItem(sku="B", quantity="3", unit_price="2.00")], supplier_name="Acme", currency="USD")
    inv1 = _doc("invoice", [LineItem(sku="A", quantity="9", unit_price="1.00"), LineItem(sku="B", quantity="3", unit_price="2.00")], supplier_name="Acme", currency="USD")
    inv2 = _doc("invoice", [LineItem(sku="B", quantity="3", unit_price="2.00"), LineItem(sku="A", quantity="9", unit_price="1.00")], supplier_name="Acme", currency="USD")
    r1 = _rules(run_comparison(po, inv1, None, CONFIG))
    r2 = _rules(run_comparison(po, inv2, None, CONFIG))
    assert r1 == r2
