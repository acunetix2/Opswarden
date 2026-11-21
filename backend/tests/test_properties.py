"""Property-based tests for comparison invariants (KIRO-GUIDE section 9)."""
from __future__ import annotations

from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.comparison_service import (
    ComparisonConfig,
    DocumentRef,
    run_comparison,
)
from app.services.doc_schema import LineItem, StructuredDocument
from app.services.normalization import parse_decimal

CONFIG = ComparisonConfig(price_tolerance=Decimal("0.01"), quantity_tolerance=Decimal("0"))

qty = st.integers(min_value=0, max_value=10000)


def _triple(ordered, received, invoiced):
    po = DocumentRef("po", StructuredDocument(document_type="purchase_order", supplier_name="S", currency="USD", line_items=[LineItem(sku="X", quantity=str(ordered))]))
    delivery = DocumentRef("dr", StructuredDocument(document_type="delivery_receipt", supplier_name="S", line_items=[LineItem(sku="X", received_quantity=str(received))]))
    invoice = DocumentRef("inv", StructuredDocument(document_type="invoice", supplier_name="S", currency="USD", line_items=[LineItem(sku="X", quantity=str(invoiced))]))
    return po, invoice, delivery


def _rules(findings):
    return {f.rule_id for f in findings}


@given(n=qty)
@settings(max_examples=100)
def test_equal_quantities_no_quantity_mismatch(n):
    po, invoice, delivery = _triple(n, n, n)
    findings = run_comparison(po, invoice, delivery, CONFIG)
    assert all(f.finding_type != "quantity_mismatch" for f in findings)


@given(received=qty, extra=st.integers(min_value=1, max_value=5000))
@settings(max_examples=100)
def test_invoice_over_received_always_flags(received, extra):
    invoiced = received + extra
    po, invoice, delivery = _triple(invoiced, received, invoiced)
    findings = run_comparison(po, invoice, delivery, CONFIG)
    assert "INVOICE_QTY_GT_RECEIVED" in _rules(findings)


@given(received=qty, base_extra=st.integers(min_value=1, max_value=100), more=st.integers(min_value=0, max_value=100))
@settings(max_examples=100)
def test_increasing_invoice_cannot_remove_over_delivery_finding(received, base_extra, more):
    # Once invoiced > received, increasing invoiced further keeps the finding.
    inv_low = received + base_extra
    inv_high = inv_low + more
    _, invoice_low, delivery = _triple(inv_low, received, inv_low)
    _, invoice_high, _ = _triple(inv_high, received, inv_high)
    low = _rules(run_comparison(None, invoice_low, delivery, CONFIG))
    high = _rules(run_comparison(None, invoice_high, delivery, CONFIG))
    assert "INVOICE_QTY_GT_RECEIVED" in low
    assert "INVOICE_QTY_GT_RECEIVED" in high


@given(a=st.decimals(min_value=0, max_value=100000, places=2), b=st.decimals(min_value=0, max_value=100000, places=2))
@settings(max_examples=100)
def test_parse_decimal_roundtrip_is_decimal(a, b):
    # Money parsing never loses precision via float.
    pa = parse_decimal(str(a))
    pb = parse_decimal(str(b))
    assert isinstance(pa + pb, Decimal)
    assert pa + pb == Decimal(str(a)) + Decimal(str(b))
