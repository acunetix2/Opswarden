"""Email layout, sender name and the exact-text rule for supplier letters."""
from __future__ import annotations

import re
import smtplib
from html import unescape

import pytest

from app.integrations.email import templates
from app.integrations.email.base import EmailMessage
from app.integrations.email.provider import SmtpEmailProvider


class _FakeSMTP:
    sent: list = []

    def __init__(self, host, port, timeout=None):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        pass

    def login(self, u, p):
        pass

    def send_message(self, msg):
        _FakeSMTP.sent.append(msg)


@pytest.fixture()
def smtp(monkeypatch):
    _FakeSMTP.sent = []
    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    return _FakeSMTP.sent


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        ("support@opswarden.aventorgo.xyz", "OpsWarden <support@opswarden.aventorgo.xyz>"),
        ("Accounts Team <ap@example.com>", "Accounts Team <ap@example.com>"),  # an explicit name wins
    ],
)
def test_inboxes_show_opswarden_as_the_sender(smtp, configured, expected):
    provider = SmtpEmailProvider("smtp.test", 587, "", "", configured, True, "OpsWarden")
    provider.send(EmailMessage(recipient="a@b.example", subject="Hi", body="Plain"), idempotency_key="k1")
    msg = smtp[0]
    assert msg["From"] == expected
    assert msg["Message-ID"].endswith("@" + expected.split("@")[-1].rstrip(">") + ">")
    assert msg["Date"]


def test_html_is_sent_alongside_plain_text(smtp):
    mail = templates.render_notice(title="Reset your password", greeting="Hi Ana,", paragraphs=["Use the button."],
                                   button=("Set a new password", "https://app.example/reset?t=abc"))
    SmtpEmailProvider("smtp.test", 587, "", "", "support@x.example", True).send(
        EmailMessage(recipient="a@b.example", subject="Reset", body=mail.text, html=mail.html), idempotency_key="k2"
    )
    msg = smtp[0]
    assert msg.is_multipart()
    assert [p.get_content_type() for p in msg.iter_parts()] == ["text/plain", "text/html"]
    assert "https://app.example/reset?t=abc" in msg.get_body(("plain",)).get_content()


def test_notice_layout_escapes_values_and_has_no_all_caps_labels():
    mail = templates.render_notice(
        title="Join <Acme> on OpsWarden",
        greeting="Hello,",
        paragraphs=['Bob "<script>alert(1)</script>" invited you.'],
        facts=[templates.Fact("Workspace", "Acme & Sons")],
        button=("Accept the invitation", 'https://app.example/invite?t=x"onmouseover="y'),
        code=None,
        footnote="Expires in 7 days.",
    )
    assert "<script>" not in mail.html and "&lt;script&gt;" in mail.html
    assert "Acme &amp; Sons" in mail.html
    assert 'href="https://app.example/invite?t=x&quot;onmouseover=&quot;y"' in mail.html
    assert "text-transform:uppercase" not in mail.html
    assert "<img" not in mail.html  # no images or tracking pixels
    # The plain-text part carries the same information.
    assert "Workspace: Acme & Sons" in mail.text and "Accept the invitation: https://app.example/invite" in mail.text


def test_supplier_letter_html_shows_exactly_the_approved_text():
    body = (
        "Hello Northstar Office Supplies,\n\n"
        "We reviewed invoice INV-8821 against PO-1048.\n"
        "Invoiced quantity: 50. Received: 40.\n\n"
        "Please send a credit note for 120.00 USD <ref PO-1048> & confirm.\n\n"
        "Kind regards,\nAccounts payable"
    )
    html = templates.render_letter(body)
    inner = re.search(r'padding-top:24px;">(.*)</td>', html, re.S).group(1)
    visible = re.sub(r"<br>", "\n", re.sub(r"</p>", "\n\n", inner))
    visible = unescape(re.sub(r"<[^>]+>", "", visible)).strip()
    assert visible == body
    assert "<a " not in inner  # nothing becomes a link


def test_approved_letter_goes_out_with_html_and_the_hashed_text(client, smtp):
    from app.integrations.email import provider as email_provider
    from tests.test_api_flow import _login, _seed_two_workspaces

    email_provider.set_email_provider(SmtpEmailProvider("smtp.test", 587, "", "", "support@opswarden.example", True))
    try:
        ids = _seed_two_workspaces()
        hdr = _login(client, "admin_a@test.io")
        case = client.post(f"/api/v1/workspaces/{ids['ws_a']}/cases", headers=hdr, json={"title": "C", "currency": "USD"}).json()
        rec = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()
        aid = client.post(f"/api/v1/recommendations/{rec['recommendation_id']}/request-approval", headers=hdr,
                          json={"recipient": "accounts@supplier.example"}).json()["approval_id"]
        client.post(f"/api/v1/approvals/{aid}/decision", headers=hdr, json={"decision": "approve"})
        client.post(f"/api/v1/approvals/{aid}/execute", headers=hdr)
        letter = next(m for m in smtp if m["To"] == "accounts@supplier.example")
        assert letter["From"] == "OpsWarden <support@opswarden.example>"
        assert letter.get_body(("plain",)).get_content().strip() == rec["body"].strip()
        assert letter.get_body(("html",)) is not None
    finally:
        email_provider.set_email_provider(None)
