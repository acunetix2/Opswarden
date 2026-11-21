"""Deterministic three-way comparison engine.

Pure application code. The LLM is NEVER the authority for arithmetic, matching,
or severity. Every rule produces: rule id, finding type, severity, compared
values, explanation, evidence references, and a human-review requirement.

Money and quantities use Decimal exclusively.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.services.doc_schema import LineItem, StructuredDocument
from app.services.normalization import (
    description_similarity,
    normalize_reference,
    normalize_sku,
    parse_decimal,
)

# ---- Severity policy (explicit, not LLM-decided) ----------------------------

SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]

_FUZZY_MATCH_THRESHOLD = Decimal("0.5")


@dataclass
class EvidenceRef:
    document_type: str
    document_id: str | None = None
    field_path: str | None = None
    page_number: int | None = None
    snippet: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "document_type": self.document_type,
            "document_id": self.document_id,
            "field_path": self.field_path,
            "page_number": self.page_number,
            "snippet": self.snippet,
        }


@dataclass
class Finding:
    rule_id: str
    finding_type: str
    severity: str
    title: str
    description: str
    expected_value: dict[str, Any] | None = None
    observed_value: dict[str, Any] | None = None
    impact_amount: Decimal | None = None
    currency: str | None = None
    evidence: list[EvidenceRef] = field(default_factory=list)
    requires_review: bool = False


@dataclass
class ComparisonConfig:
    price_tolerance: Decimal = Decimal("0.01")
    quantity_tolerance: Decimal = Decimal("0")


@dataclass
class DocumentRef:
    """Pairs a structured document with its stored document id for evidence."""

    document_id: str | None
    doc: StructuredDocument


# ---- Line-item matching -----------------------------------------------------


@dataclass
class MatchedLine:
    key: str
    po: LineItem | None = None
    invoice: LineItem | None = None
    delivery: LineItem | None = None
    match_method: str = "sku"
    match_confidence: Decimal = Decimal("1")


def _line_key(item: LineItem) -> str | None:
    sku = normalize_sku(item.sku)
    if sku:
        return f"sku:{sku}"
    ref = normalize_reference(item.description)
    if ref:
        return f"desc:{ref}"
    return None


def match_line_items(
    po: StructuredDocument | None,
    invoice: StructuredDocument | None,
    delivery: StructuredDocument | None,
) -> list[MatchedLine]:
    """Match by SKU first, then exact normalized description, then fuzzy.

    Ambiguous (fuzzy) matches are flagged for human review downstream.
    Reordering inputs with stable identifiers must not change results, so we
    key deterministically and sort the output by key.
    """
    matched: dict[str, MatchedLine] = {}

    def ingest(doc: StructuredDocument | None, slot: str) -> list[LineItem]:
        return list(doc.line_items) if doc else []

    po_items = ingest(po, "po")
    inv_items = ingest(invoice, "invoice")
    del_items = ingest(delivery, "delivery")

    # Pass 1: exact key (sku or exact description) matching.
    def place(items: list[LineItem], slot: str) -> list[LineItem]:
        leftovers: list[LineItem] = []
        for it in items:
            key = _line_key(it)
            if key is None:
                leftovers.append(it)
                continue
            ml = matched.setdefault(key, MatchedLine(key=key))
            if getattr(ml, slot) is None:
                setattr(ml, slot, it)
            else:
                leftovers.append(it)
        return leftovers

    po_left = place(po_items, "po")
    inv_left = place(inv_items, "invoice")
    del_left = place(del_items, "delivery")

    # Pass 2: fuzzy description matching for leftovers (propose, flag review).
    def fuzzy_attach(leftovers: list[LineItem], slot: str) -> None:
        for it in leftovers:
            best_key = None
            best_score = Decimal("0")
            for key, ml in matched.items():
                ref_item = ml.po or ml.invoice or ml.delivery
                if ref_item is None or getattr(ml, slot) is not None:
                    continue
                score = description_similarity(it.description, ref_item.description)
                if score > best_score:
                    best_score = score
                    best_key = key
            if best_key is not None and best_score >= _FUZZY_MATCH_THRESHOLD:
                ml = matched[best_key]
                setattr(ml, slot, it)
                ml.match_method = "fuzzy"
                ml.match_confidence = min(ml.match_confidence, best_score)
            else:
                # Unmatched line becomes its own entry needing review.
                k = f"unmatched:{slot}:{len(matched)}"
                ml = MatchedLine(key=k, match_method="unmatched", match_confidence=Decimal("0"))
                setattr(ml, slot, it)
                matched[k] = ml

    fuzzy_attach(po_left, "po")
    fuzzy_attach(inv_left, "invoice")
    fuzzy_attach(del_left, "delivery")

    return [matched[k] for k in sorted(matched.keys())]


# ---- Rule helpers -----------------------------------------------------------


def _qty(item: LineItem | None, received: bool = False) -> Decimal | None:
    if item is None:
        return None
    if received:
        rq = parse_decimal(item.received_quantity)
        # Use received_quantity when present (including zero); fall back to
        # quantity only when received_quantity is genuinely absent.
        if rq is not None:
            return rq
        return parse_decimal(item.quantity)
    return parse_decimal(item.quantity)


def _label(item: LineItem | None) -> str:
    if item is None:
        return "item"
    return item.description or item.sku or "item"


# ---- The engine -------------------------------------------------------------


def run_comparison(
    po: DocumentRef | None,
    invoice: DocumentRef | None,
    delivery: DocumentRef | None,
    config: ComparisonConfig,
    existing_invoice_numbers: set[str] | None = None,
) -> list[Finding]:
    findings: list[Finding] = []
    po_doc = po.doc if po else None
    inv_doc = invoice.doc if invoice else None
    del_doc = delivery.doc if delivery else None

    currency = (inv_doc and inv_doc.currency) or (po_doc and po_doc.currency) or "USD"

    # --- Document presence ---
    if inv_doc is None:
        findings.append(
            Finding(
                rule_id="MISSING_DOCUMENT",
                finding_type="missing_document",
                severity="high",
                title="Supplier invoice is missing",
                description="No invoice was provided, so a full three-way match cannot be completed.",
                requires_review=True,
            )
        )
    if po_doc is None:
        findings.append(
            Finding(
                rule_id="MISSING_DOCUMENT",
                finding_type="missing_document",
                severity="medium",
                title="Purchase order is missing",
                description="No purchase order was provided; ordered quantities and prices cannot be verified.",
                requires_review=True,
            )
        )
    if del_doc is None:
        findings.append(
            Finding(
                rule_id="MISSING_DOCUMENT",
                finding_type="missing_document",
                severity="medium",
                title="Delivery receipt is missing",
                description="No delivery receipt was provided; received quantities cannot be verified.",
                requires_review=True,
            )
        )

    # --- Supplier identity ---
    findings.extend(_check_supplier(po, invoice, delivery))

    # --- PO reference consistency ---
    findings.extend(_check_po_reference(po, invoice))

    # --- Currency consistency ---
    findings.extend(_check_currency(po, invoice))

    # --- Duplicate invoice ---
    if inv_doc and existing_invoice_numbers:
        num = normalize_reference(inv_doc.document_number)
        if num and num in existing_invoice_numbers:
            findings.append(
                Finding(
                    rule_id="DUPLICATE_INVOICE",
                    finding_type="duplicate_invoice",
                    severity="high",
                    title="Duplicate invoice number",
                    description=(
                        f"Invoice number {inv_doc.document_number} already exists for this "
                        "supplier in the workspace."
                    ),
                    observed_value={"field": "document_number", "value": inv_doc.document_number},
                    currency=currency,
                    evidence=[EvidenceRef("invoice", invoice.document_id if invoice else None, "document_number")],
                    requires_review=True,
                )
            )

    # --- Line-item level checks ---
    matches = match_line_items(po_doc, inv_doc, del_doc)
    for ml in matches:
        findings.extend(_check_line(ml, po, invoice, delivery, config, currency))

    # --- Totals arithmetic ---
    if inv_doc:
        findings.extend(_check_totals(invoice, currency))

    return findings


def _check_supplier(po, invoice, delivery) -> list[Finding]:
    docs = [(d, slot) for d, slot in [(po, "purchase_order"), (invoice, "invoice"), (delivery, "delivery_receipt")] if d]
    names = {}
    for ref, slot in docs:
        n = normalize_reference(ref.doc.supplier_name)
        if n:
            names.setdefault(n, []).append((ref, slot))
    if len(names) > 1:
        observed = {slot: ref.doc.supplier_name for ref, slot in docs if ref.doc.supplier_name}
        return [
            Finding(
                rule_id="SUPPLIER_MISMATCH",
                finding_type="supplier_mismatch",
                severity="high",
                title="Supplier identity differs across documents",
                description="The supplier name is not consistent across the provided documents.",
                observed_value={"field": "supplier_name", "values": observed},
                evidence=[EvidenceRef(slot, ref.document_id, "supplier_name") for ref, slot in docs],
                requires_review=True,
            )
        ]
    return []


def _check_po_reference(po, invoice) -> list[Finding]:
    if not invoice:
        return []
    inv_po = normalize_reference(invoice.doc.purchase_order_reference)
    if not inv_po:
        return [
            Finding(
                rule_id="PO_REFERENCE_MISSING",
                finding_type="po_reference_missing",
                severity="medium",
                title="Invoice is missing a purchase order reference",
                description="The invoice does not reference a purchase order, so it cannot be tied to an order.",
                evidence=[EvidenceRef("invoice", invoice.document_id, "purchase_order_reference")],
                requires_review=True,
            )
        ]
    if po:
        po_num = normalize_reference(po.doc.document_number) or normalize_reference(
            po.doc.purchase_order_reference
        )
        if po_num and inv_po != po_num:
            return [
                Finding(
                    rule_id="PO_REFERENCE_MISMATCH",
                    finding_type="po_reference_mismatch",
                    severity="medium",
                    title="Purchase order reference mismatch",
                    description=(
                        f"The invoice references {invoice.doc.purchase_order_reference}, "
                        f"but the purchase order is {po.doc.document_number}."
                    ),
                    expected_value={"field": "po_reference", "value": po.doc.document_number},
                    observed_value={"field": "po_reference", "value": invoice.doc.purchase_order_reference},
                    evidence=[
                        EvidenceRef("purchase_order", po.document_id, "document_number"),
                        EvidenceRef("invoice", invoice.document_id, "purchase_order_reference"),
                    ],
                    requires_review=True,
                )
            ]
    return []


def _check_currency(po, invoice) -> list[Finding]:
    if not (po and invoice):
        return []
    pc = (po.doc.currency or "").upper()
    ic = (invoice.doc.currency or "").upper()
    if pc and ic and pc != ic:
        return [
            Finding(
                rule_id="CURRENCY_MISMATCH",
                finding_type="currency_mismatch",
                severity="high",
                title="Currency mismatch between PO and invoice",
                description=f"The purchase order uses {pc} but the invoice uses {ic}.",
                expected_value={"field": "currency", "value": pc},
                observed_value={"field": "currency", "value": ic},
                evidence=[
                    EvidenceRef("purchase_order", po.document_id, "currency"),
                    EvidenceRef("invoice", invoice.document_id, "currency"),
                ],
                requires_review=True,
            )
        ]
    return []


def _check_line(ml: MatchedLine, po, invoice, delivery, config: ComparisonConfig, currency: str) -> list[Finding]:
    out: list[Finding] = []
    ordered = _qty(ml.po)
    invoiced = _qty(ml.invoice)
    received = _qty(ml.delivery, received=True)
    label = _label(ml.invoice or ml.po or ml.delivery)
    qtol = config.quantity_tolerance

    po_ev = EvidenceRef("purchase_order", po.document_id if po else None, "line_items.quantity")
    inv_ev = EvidenceRef("invoice", invoice.document_id if invoice else None, "line_items.quantity")
    del_ev = EvidenceRef("delivery_receipt", delivery.document_id if delivery else None, "line_items.received_quantity")

    if ml.match_method in ("fuzzy", "unmatched"):
        out.append(
            Finding(
                rule_id="AMBIGUOUS_MATCH",
                finding_type="ambiguous_match",
                severity="low",
                title=f"Line item needs manual match: {label}",
                description=(
                    "This line item could not be matched by a stable identifier and was matched "
                    f"by description similarity ({ml.match_method}). Confirm it refers to the same product."
                ),
                evidence=[e for e in [po_ev, inv_ev, del_ev] if e.document_id],
                requires_review=True,
            )
        )

    # Invoice quantity greater than received quantity
    if invoiced is not None and received is not None and invoiced - received > qtol:
        diff = invoiced - received
        # Value in dispute: excess units at the invoiced unit price (decimal-safe).
        inv_unit = parse_decimal(ml.invoice.unit_price) if ml.invoice else None
        disputed = diff * inv_unit if inv_unit is not None else None
        out.append(
            Finding(
                rule_id="INVOICE_QTY_GT_RECEIVED",
                finding_type="quantity_mismatch",
                severity="high",
                title="Invoice quantity exceeds delivered quantity",
                description=(
                    f"The invoice lists {invoiced} units of {label} while the delivery receipt "
                    f"records {received}. The difference is {diff} units."
                ),
                expected_value={"field": "received_quantity", "value": str(received)},
                observed_value={"field": "invoiced_quantity", "value": str(invoiced)},
                impact_amount=disputed,
                currency=currency,
                evidence=[del_ev, inv_ev],
                requires_review=False,
            )
        )

    # Received below ordered
    if ordered is not None and received is not None and ordered - received > qtol:
        out.append(
            Finding(
                rule_id="RECEIVED_QTY_LT_ORDERED",
                finding_type="quantity_mismatch",
                severity="medium",
                title="Delivered quantity is below ordered quantity",
                description=(
                    f"{ordered} units of {label} were ordered but only {received} were recorded as received."
                ),
                expected_value={"field": "ordered_quantity", "value": str(ordered)},
                observed_value={"field": "received_quantity", "value": str(received)},
                evidence=[po_ev, del_ev],
                requires_review=False,
            )
        )

    # Invoice qty different from ordered
    if ordered is not None and invoiced is not None and abs(invoiced - ordered) > qtol:
        out.append(
            Finding(
                rule_id="INVOICE_QTY_NE_ORDERED",
                finding_type="quantity_mismatch",
                severity="medium",
                title="Invoiced quantity differs from ordered quantity",
                description=(
                    f"{ordered} units of {label} were ordered but {invoiced} were invoiced."
                ),
                expected_value={"field": "ordered_quantity", "value": str(ordered)},
                observed_value={"field": "invoiced_quantity", "value": str(invoiced)},
                evidence=[po_ev, inv_ev],
                requires_review=False,
            )
        )

    # Unit price mismatch beyond tolerance
    po_price = parse_decimal(ml.po.unit_price) if ml.po else None
    inv_price = parse_decimal(ml.invoice.unit_price) if ml.invoice else None
    if po_price is not None and inv_price is not None and abs(inv_price - po_price) > config.price_tolerance:
        impact = None
        if invoiced is not None:
            impact = (inv_price - po_price) * invoiced
        out.append(
            Finding(
                rule_id="UNIT_PRICE_MISMATCH",
                finding_type="price_mismatch",
                severity="high",
                title="Unit price differs from the purchase order",
                description=(
                    f"The purchase order unit price for {label} is {po_price} but the invoice charges "
                    f"{inv_price}."
                ),
                expected_value={"field": "unit_price", "value": str(po_price)},
                observed_value={"field": "unit_price", "value": str(inv_price)},
                impact_amount=impact,
                currency=currency,
                evidence=[po_ev, inv_ev],
                requires_review=False,
            )
        )

    return out


def _check_totals(invoice, currency: str) -> list[Finding]:
    doc = invoice.doc
    out: list[Finding] = []

    # Line totals reconcile to quantity * unit_price
    for idx, li in enumerate(doc.line_items):
        q = parse_decimal(li.quantity)
        up = parse_decimal(li.unit_price)
        lt = parse_decimal(li.line_total)
        if q is not None and up is not None and lt is not None:
            expected = q * up
            if abs(expected - lt) > Decimal("0.01"):
                out.append(
                    Finding(
                        rule_id="LINE_TOTAL_MISMATCH",
                        finding_type="total_mismatch",
                        severity="medium",
                        title="Line total does not match quantity times unit price",
                        description=(
                            f"Line {idx + 1}: {q} x {up} = {expected}, but the line total is {lt}."
                        ),
                        expected_value={"field": "line_total", "value": str(expected)},
                        observed_value={"field": "line_total", "value": str(lt)},
                        impact_amount=lt - expected,
                        currency=currency,
                        evidence=[EvidenceRef("invoice", invoice.document_id, f"line_items[{idx}].line_total")],
                        requires_review=False,
                    )
                )

    # Grand total = subtotal + tax
    subtotal = parse_decimal(doc.subtotal)
    tax = parse_decimal(doc.tax)
    grand = parse_decimal(doc.grand_total)
    if subtotal is not None and grand is not None:
        expected_total = subtotal + (tax or Decimal("0"))
        if abs(expected_total - grand) > Decimal("0.01"):
            out.append(
                Finding(
                    rule_id="TOTAL_MISMATCH",
                    finding_type="total_mismatch",
                    severity="high",
                    title="Invoice totals do not reconcile",
                    description=(
                        f"Subtotal {subtotal} plus tax {tax or 0} equals {expected_total}, "
                        f"but the grand total is {grand}."
                    ),
                    expected_value={"field": "grand_total", "value": str(expected_total)},
                    observed_value={"field": "grand_total", "value": str(grand)},
                    impact_amount=grand - expected_total,
                    currency=currency,
                    evidence=[EvidenceRef("invoice", invoice.document_id, "grand_total")],
                    requires_review=False,
                )
            )

    return out
