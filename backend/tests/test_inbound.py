"""Invoices by email, supplier replies with credit notes, and follow-up reminders."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import pytest

from app.core.config import settings
from app.db import SessionLocal
from app.models.approval import Approval
from app.models.case import Case
from app.services import followup_service
from tests.test_api_flow import _login, _seed_two_workspaces
from tests.test_automation import INVOICE, PO, RECEIPT_SHORT, _Outbox, _run  # noqa: F401

SECRET = "test-automation-secret"


@pytest.fixture(autouse=True)
def _inbox_settings(monkeypatch):
    monkeypatch.setattr(settings, "inbound_email_domain", "inbox.opswarden.test")
    monkeypatch.setattr(settings, "automation_secret", SECRET)


@pytest.fixture()
def outbox():
    from app.integrations.email import provider as email_provider

    box = _Outbox()
    email_provider.set_email_provider(box)
    yield box
    email_provider.set_email_provider(None)


def _fixture(payload: dict) -> bytes:
    return ("__OPSWARDEN_JSON__" + json.dumps(payload)).encode()


def _email(to: str, subject: str, attachments: list[tuple[str, bytes]], sender="ap@northstar.example", body="Please see attached.") -> bytes:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = f"<{abs(hash((subject, to, sender, len(attachments))))}@mail.test>"
    msg.set_content(body)
    for name, data in attachments:
        msg.add_attachment(data, maintype="application", subtype="json", filename=name)
    return msg.as_bytes()


def _post(client, raw: bytes, secret=SECRET, to=None):
    headers = {"X-OpsWarden-Secret": secret, "Content-Type": "message/rfc822"}
    if to:
        headers["X-OpsWarden-To"] = to
    return client.post("/api/v1/inbound/email", content=raw, headers=headers)


def _inbox(client, hdr, ws) -> str:
    r = client.post(f"/api/v1/workspaces/{ws}/inbound", headers=hdr)
    assert r.status_code == 200, r.text
    return r.json()["address"]


def test_admin_turns_on_the_inbox_and_only_admins_see_it(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    address = _inbox(client, admin, ids["ws_a"])
    assert address.startswith("invoices+") and address.endswith("@inbox.opswarden.test")
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=admin).json()["inbound_address"] == address

    contrib = _login(client, "contrib_a@test.io")
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=contrib).json()["inbound_address"] is None
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/inbound", headers=contrib).status_code == 403
    assert client.get(f"/api/v1/workspaces/{ids['ws_a']}/inbound", headers=_login(client, "admin_b@test.io")).status_code == 404

    # Replacing the address retires the old one.
    new = _inbox(client, admin, ids["ws_a"])
    assert new != address
    assert _post(client, _email(address, "Invoice", [("inv.json", _fixture(INVOICE))])).status_code == 404


def test_forwarded_invoice_is_filed_like_a_drop(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    address = _inbox(client, admin, ids["ws_a"])
    raw = _email(f"Accounts <{address}>", "Fwd: Northstar documents",
                 [("PO-1048.json", _fixture(PO)), ("delivery-GRN-77.json", _fixture(RECEIPT_SHORT)), ("INV-8821.json", _fixture(INVOICE))])
    r = _post(client, raw)
    assert r.status_code == 202, r.text
    body = r.json()
    assert [f["document_type"] for f in body["filed"]] == ["purchase_order", "delivery_receipt", "invoice"]
    assert len({f["case_id"] for f in body["filed"]}) == 1  # all three on one case
    assert body["filed"][-1]["analysis_started"] is True
    case_id = body["filed"][0]["case_id"]
    findings = client.get(f"/api/v1/cases/{case_id}/findings", headers=admin).json()["items"]
    assert "INVOICE_QTY_GT_RECEIVED" in {f["rule_id"] for f in findings}

    # The same message delivered twice (retries) is filed once.
    assert _post(client, raw).json()["ignored"] == "duplicate"


def test_inbound_rejects_bad_secrets_unknown_addresses_and_loops(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    address = _inbox(client, admin, ids["ws_a"])
    raw = _email(address, "Invoice", [("inv.json", _fixture(INVOICE))])
    assert _post(client, raw, secret="wrong").status_code == 404
    assert _post(client, raw, secret="").status_code == 404
    assert _post(client, _email("invoices+aaaaaaaaaaaaaaaaaaaa@inbox.opswarden.test", "x", [])).status_code == 404

    loop = EmailMessage()
    loop["From"], loop["To"], loop["Subject"] = "a@b.example", address, "Out of office"
    loop["Auto-Submitted"] = "auto-replied"
    loop.set_content("I'm away")
    assert _post(client, loop.as_bytes()).json()["ignored"] == "automatic_or_own_message"

    bad = _post(client, _email(address, "Invoice", [("virus.exe", b"MZ\x90\x00")])).json()
    assert bad["filed"] == [] and bad["rejected"] == [{"filename": "virus.exe", "code": "UNSUPPORTED_FILE_TYPE"}]

    # Another workspace's address never files into workspace A.
    db = SessionLocal()
    assert db.query(Case).filter(Case.workspace_id == ids["ws_b"]).count() == 0
    db.close()


def test_member_can_test_the_inbox_with_a_saved_email(client):
    ids = _seed_two_workspaces()
    contrib = _login(client, "contrib_a@test.io")
    raw = _email("anyone@example.com", "Invoice", [("INV-8821.json", _fixture(INVOICE))])
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/inbound/test", headers=contrib,
                    files={"file": ("forwarded.eml", raw, "message/rfc822")})
    assert r.status_code == 202, r.text
    assert r.json()["filed"][0]["document_type"] == "invoice"
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/inbound/test", headers=_login(client, "admin_b@test.io"),
                       files={"file": ("x.eml", raw, "message/rfc822")}).status_code == 404


def _sent_case(client, outbox):
    """A case whose supplier letter went out: returns (ids, hdr, case, inbox address)."""
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    address = _inbox(client, hdr, ids["ws_a"])
    case = _run(client, hdr, ids["ws_a"], RECEIPT_SHORT)
    letter = client.get(f"/api/v1/workspaces/{ids['ws_a']}/approvals", headers=hdr).json()[0]
    assert client.post(f"/api/v1/approvals/{letter['id']}/decision", headers=hdr, json={"decision": "approve"}).json()["status"] == "executed"
    assert client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()["status"] == "in_progress"
    return ids, hdr, case, address, letter


def test_supplier_letter_replies_come_back_to_the_inbox(client, outbox):
    _ids, _hdr, case, address, letter = _sent_case(client, outbox)
    to_supplier = next(m for m in outbox.sent if m.recipient == "ap@northstar.example")
    assert to_supplier.reply_to == address
    assert case["case_number"] in to_supplier.subject


def test_credit_note_reply_closes_the_case_as_recovered(client, outbox):
    ids, hdr, case, address, letter = _sent_case(client, outbox)
    credit = {"document_type": "invoice", "supplier_name": "Northstar Office Supplies", "document_number": "CN-55",
              "currency": "USD", "grand_total": "120.00", "line_items": []}
    r = _post(client, _email(address, f"Re: {letter['subject']}", [("credit-note-CN-55.json", _fixture(credit))]))
    assert r.status_code == 202, r.text
    assert r.json()["reply"]["resolved"] is True
    closed = client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()
    assert closed["status"] == "resolved" and closed["resolution_outcome"] == "recovered"
    assert closed["recovered_amount"] == "120.00"
    docs = client.get(f"/api/v1/cases/{case['id']}/documents", headers=hdr).json()
    assert "credit_note" in {d["document_type"] for d in docs}
    totals = client.get(f"/api/v1/workspaces/{ids['ws_a']}/overview", headers=hdr).json()["metrics"]["recovered_total"]
    assert totals == [{"currency": "USD", "amount": "120.00"}]


def test_credit_note_for_more_than_the_dispute_needs_a_person(client, outbox):
    _ids, hdr, case, address, letter = _sent_case(client, outbox)
    credit = {"document_type": "invoice", "document_number": "CN-56", "currency": "USD", "grand_total": "9999.00", "line_items": []}
    outbox.sent.clear()
    reply = _post(client, _email(address, f"Re: {letter['subject']}", [("credit-note.json", _fixture(credit))])).json()["reply"]
    assert reply["resolved"] is False
    assert client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()["status"] == "in_progress"
    assert any("more than the value in dispute" in m.body for m in outbox.sent)


def test_quiet_supplier_gets_a_reminder_queued_for_approval(client, outbox):
    _ids, hdr, case, address, letter = _sent_case(client, outbox)
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    assert followup_service.run_due(db, now=now + timedelta(days=2))["reminders_drafted"] == 0
    assert followup_service.run_due(db, now=now + timedelta(days=6))["reminders_drafted"] == 1
    assert followup_service.run_due(db, now=now + timedelta(days=6))["reminders_drafted"] == 0  # one waiting already
    reminder = db.query(Approval).filter(Approval.case_id == case["id"], Approval.action_type == "supplier_reminder").one()
    payload = json.loads(reminder.action_payload_json)
    db.close()
    assert reminder.status == "pending"
    assert payload["subject"].startswith("Reminder: ") and payload["recipient"] == "ap@northstar.example"
    assert "haven't received a reply" in payload["body"]
    assert json.loads(letter_body := json.dumps(letter["body"])) and letter["body"].strip() in payload["body"]  # original quoted, no new figures


def test_a_reply_stops_reminders(client, outbox):
    _ids, _hdr, case, address, letter = _sent_case(client, outbox)
    _post(client, _email(address, f"Re: {letter['subject']}", [], body="We're checking and will reply this week."))
    db = SessionLocal()
    assert followup_service.run_due(db, now=datetime.now(timezone.utc) + timedelta(days=10))["reminders_drafted"] == 0
    db.close()


def test_scheduled_run_needs_the_secret(client):
    assert client.post("/api/v1/automation/run").status_code == 404
    r = client.post("/api/v1/automation/run", headers={"X-OpsWarden-Secret": SECRET})
    assert r.status_code == 200 and r.json() == {"reminders_drafted": 0}
