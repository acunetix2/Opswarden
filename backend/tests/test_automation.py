"""Automatic follow-up after analysis, register auto-fill, and send on approval."""
from __future__ import annotations

import json

import pytest

from app.db import SessionLocal
from app.integrations.email import provider as email_provider
from app.integrations.email.base import EmailMessage, EmailProvider, SendResult
from app.models.audit_event import AuditEvent
from app.models.registry import PurchaseOrder, Supplier
from tests.test_api_flow import _login, _seed_two_workspaces


class _Outbox(EmailProvider):
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    @property
    def configured(self) -> bool:
        return True

    def send(self, message: EmailMessage, idempotency_key: str) -> SendResult:
        self.sent.append(message)
        return SendResult(provider_reference=f"msg-{len(self.sent)}")


@pytest.fixture()
def outbox():
    box = _Outbox()
    email_provider.set_email_provider(box)
    yield box
    email_provider.set_email_provider(None)


PO = {"document_type": "purchase_order", "supplier_name": "Northstar Office Supplies", "supplier_email": "AP@Northstar.example",
      "supplier_phone": "+1 555 0100", "document_number": "PO-1048", "document_date": "2026-11-02", "currency": "USD", "grand_total": "600.00",
      "line_items": [{"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"}]}
RECEIPT_FULL = {"document_type": "delivery_receipt", "supplier_name": "Northstar Office Supplies", "purchase_order_reference": "PO-1048",
                "document_number": "GRN-77", "line_items": [{"sku": "PROD-B", "received_quantity": "50"}]}
RECEIPT_SHORT = {**RECEIPT_FULL, "line_items": [{"sku": "PROD-B", "received_quantity": "40"}]}
INVOICE = {"document_type": "invoice", "supplier_name": "Northstar Office Supplies", "document_number": "INV-8821",
           "purchase_order_reference": "PO-1048", "currency": "USD", "subtotal": "600.00", "tax": "0.00", "grand_total": "600.00",
           "line_items": [{"sku": "PROD-B", "description": "Product B", "quantity": "50", "unit_price": "12.00", "line_total": "600.00"}]}


def _upload(client, hdr, case_id, payload):
    content = ("__OPSWARDEN_JSON__" + json.dumps(payload)).encode()
    r = client.post(
        f"/api/v1/cases/{case_id}/documents", headers=hdr, data={"document_type": payload["document_type"]},
        files={"file": (f"{payload['document_type']}.json", content, "application/json")},
    )
    assert r.status_code == 202, r.text


def _run(client, hdr, ws, receipt, title="Bolts", invoice=INVOICE):
    case = client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": title, "currency": "USD"}).json()
    for payload in (PO, receipt, invoice):
        _upload(client, hdr, case["id"], payload)
    assert client.post(f"/api/v1/cases/{case['id']}/analyze", headers=hdr).status_code == 202
    return client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()


def _follow_up(case_id):
    db = SessionLocal()
    ev = db.query(AuditEvent).filter(AuditEvent.case_id == case_id, AuditEvent.event_type == "automation.completed").all()
    db.close()
    assert len(ev) == 1
    return json.loads(ev[0].event_payload_json)["actions"]


def test_documents_that_agree_close_the_case(client, outbox):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _run(client, hdr, ids["ws_a"], RECEIPT_FULL)
    assert case["status"] == "resolved"
    assert case["resolution_outcome"] == "no_discrepancy"
    assert "agree" in case["resolution_note"]
    assert _follow_up(case["id"]) == ["resolved"]
    assert outbox.sent == []  # nothing to tell anyone


def test_discrepancy_queues_the_letter_and_emails_approvers_only(client, outbox):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    assert case["status"] == "ready_for_approval"
    assert _follow_up(case["id"]) == ["letter_queued", "reviewers_emailed"]

    pending = client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr, params={"status": "pending"}).json()
    assert len(pending) == 1
    letter = pending[0]
    assert letter["case_id"] == case["id"]
    # The recipient came from the supplier the agent registered from the PO.
    assert letter["recipient"] == "ap@northstar.example"

    # Only workspace approvers were emailed; the supplier got nothing.
    assert [m.recipient for m in outbox.sent] == ["admin_a@test.io"]
    assert "waiting for approval" in outbox.sent[0].subject
    assert "Nothing has been sent to the supplier yet." in outbox.sent[0].body


def test_switches_off_means_people_do_it(client, outbox):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    flags = {"auto_register": False, "auto_draft_letters": False, "auto_resolve_clean": False, "notify_reviewers": False}
    s = client.patch(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=hdr, json=flags).json()
    assert all(s[k] is False for k in flags) and s["send_on_approval"] is True

    clean = _run(client, hdr, ids["ws_a"], RECEIPT_FULL, "Clean")
    short = _run(client, hdr, ids["ws_a"], RECEIPT_SHORT, "Short", {**INVOICE, "document_number": "INV-8822"})
    assert clean["status"] == "ready_for_approval" and short["status"] == "ready_for_approval"
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr).json() == []
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr).json() == []
    assert outbox.sent == []
    assert _follow_up(short["id"]) == []

    # Contributors can't change automation.
    contrib = _login(client, "contrib_a@test.io")
    assert client.patch(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=contrib, json={"auto_register": True}).status_code == 403


def test_register_learns_suppliers_pos_and_document_numbers(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    hdr_b = _login(client, "admin_b@test.io")
    # Same supplier name in another workspace must not be borrowed.
    client.post(f"/api/v1/workspaces/{ids['ws_b']}/registry/suppliers", headers=hdr_b, json={"name": "Northstar Office Supplies"})

    case = _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)

    suppliers = client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr).json()
    assert [s["name"] for s in suppliers] == ["Northstar Office Supplies"]
    sup = suppliers[0]
    assert sup["contact_email"] == "ap@northstar.example" and sup["phone"] == "+1 555 0100"
    pos = client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/purchase-orders", headers=hdr).json()
    assert [p["po_number"] for p in pos] == ["PO-1048"]
    assert pos[0]["supplier_id"] == sup["id"] and pos[0]["total_amount"].startswith("600")

    detail = client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()
    assert detail["supplier_id"] == sup["id"] and detail["purchase_order_id"] == pos[0]["id"]

    docs = client.get(f"/api/v1/cases/{case['id']}/documents", headers=hdr).json()
    assert {d["document_type"]: d["document_number"] for d in docs} == {
        "purchase_order": "PO-1048", "delivery_receipt": "GRN-77", "invoice": "INV-8821",
    }
    hits = client.get(f"/api/v1/workspaces/{ids['ws_a']}/search", headers=hdr, params={"q": "INV-8821"}).json()["hits"]
    assert any(h["kind"] == "document" for h in hits)

    db = SessionLocal()
    added = {e.event_type for e in db.query(AuditEvent).filter(AuditEvent.case_id == case["id"]) if e.event_type.startswith("register.")}
    b_supplier = db.query(Supplier).filter(Supplier.workspace_id == ids["ws_b"]).one()
    po = db.query(PurchaseOrder).filter(PurchaseOrder.workspace_id == ids["ws_a"]).one()
    db.close()
    assert added == {"register.supplier_added", "register.purchase_order_added"}
    assert b_supplier.contact_email is None  # workspace B untouched
    assert po.storage_key  # the register keeps its own copy of the PO file


def test_register_never_overwrites_what_a_person_entered(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr,
        json={"name": "Northstar Office Supplies", "contact_email": "billing@northstar.example"},
    )
    _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    sup = client.get(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr).json()[0]
    assert sup["contact_email"] == "billing@northstar.example"  # kept
    assert sup["phone"] == "+1 555 0100"  # empty field filled


def test_approving_sends_straight_away(client, outbox):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    # A person registered the supplier's address, so it's trusted for sending on approval.
    client.post(
        f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr,
        json={"name": "Northstar Office Supplies", "contact_email": "ap@northstar.example"},
    )
    case = _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    letter = client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr).json()[0]
    outbox.sent.clear()

    decided = client.post(f"/api/v1/approvals/{letter['id']}/decision", headers=hdr, json={"decision": "approve"}).json()
    assert decided["status"] == "executed"
    assert [m.recipient for m in outbox.sent] == ["ap@northstar.example"]
    # Sent: the case now waits for the supplier's reply.
    assert client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()["status"] == "in_progress"
    # Pressing Send afterwards is harmless (idempotent).
    again = client.post(f"/api/v1/approvals/{letter['id']}/execute", headers=hdr).json()
    assert again["status"] == "executed" and len(outbox.sent) == 1


def test_address_read_from_a_document_is_flagged_then_sent_on_approval(client, outbox):
    """The approver is warned the address came from a document; approving sends to it."""
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    letter = client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr).json()[0]
    assert letter["recipient"] == "ap@northstar.example"
    assert letter["requested_by_name"] == "OpsWarden (automatic)"
    assert "check it before you approve" in outbox.sent[0].body
    assert "Approving sends it straight away." in outbox.sent[0].body
    outbox.sent.clear()

    decided = client.post(f"/api/v1/approvals/{letter['id']}/decision", headers=hdr, json={"decision": "approve"}).json()
    # The approver saw the flagged address on the approval; approving sends it.
    assert decided["status"] == "executed" and decided["recipient_source"] == "document"
    assert [m.recipient for m in outbox.sent] == ["ap@northstar.example"]


def test_letter_recipient_is_filled_from_the_supplier_register(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    hdr_b = _login(client, "admin_b@test.io")
    client.post(f"/api/v1/workspaces/{ids['ws_a']}/registry/suppliers", headers=hdr,
                json={"name": "Acme Fasteners", "contact_email": "Accounts@Acme.example"})
    client.post(f"/api/v1/workspaces/{ids['ws_b']}/registry/suppliers", headers=hdr_b,
                json={"name": "Harbor Tools", "contact_email": "ap@harbor.example"})

    # The case only has the supplier's name typed in; the register entry is found by name.
    case = client.post(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr,
                       json={"title": "Short delivery", "currency": "USD", "supplier_name": "acme  fasteners"}).json()
    assert case["supplier_id"] is None
    draft = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()
    assert draft["recipient"] == "accounts@acme.example" and draft["recipient_source"] == "register"
    assert client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()["supplier_contact_email"] == "accounts@acme.example"

    # A name that only exists in another workspace fills nothing.
    other = client.post(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr,
                        json={"title": "Other", "currency": "USD", "supplier_name": "Harbor Tools"}).json()
    draft = client.post(f"/api/v1/cases/{other['id']}/recommendations/email-draft", headers=hdr).json()
    assert draft["recipient"] is None and draft["recipient_source"] is None


def test_rejecting_sends_nothing(client, outbox):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    letter = client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr).json()[0]
    outbox.sent.clear()
    decided = client.post(f"/api/v1/approvals/{letter['id']}/decision", headers=hdr, json={"decision": "reject"}).json()
    assert decided["status"] == "rejected" and outbox.sent == []
