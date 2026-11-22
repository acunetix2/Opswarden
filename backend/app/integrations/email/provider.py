from __future__ import annotations

import smtplib
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr

from app.core.config import settings
from app.integrations.email.base import EmailMessage, EmailProvider, SendResult


class NullEmailProvider(EmailProvider):
    """No email integration configured.

    The system must NOT pretend an email was sent. Callers fall back to an
    export/copy action when `configured` is False.
    """

    @property
    def configured(self) -> bool:
        return False

    def send(self, message: EmailMessage, idempotency_key: str) -> SendResult:
        raise RuntimeError("Email provider is not configured")


class SmtpEmailProvider(EmailProvider):
    """Sends through an SMTP relay. Credentials come only from server settings.

    The approval gate guarantees a single call per approval; the idempotency key
    is also sent as a header so the relay/recipient can de-duplicate.
    """

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        sender: str,
        use_tls: bool,
        sender_name: str = "OpsWarden",
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._use_tls = use_tls
        # Inboxes show the display name, not the mailbox ("OpsWarden", not "support").
        name, address = parseaddr(sender)
        self._address = address or sender
        self._sender = formataddr((name or sender_name, self._address)) if (name or sender_name) else self._address

    @property
    def configured(self) -> bool:
        return bool(self._host and self._address)

    @property
    def sender(self) -> str:
        return self._sender

    def send(self, message: EmailMessage, idempotency_key: str) -> SendResult:
        mime = MimeMessage()
        mime["From"] = self._sender
        mime["To"] = message.recipient
        mime["Subject"] = message.subject
        if message.reply_to:
            mime["Reply-To"] = message.reply_to
        domain = self._address.split("@")[-1] or None
        message_id = make_msgid(domain=domain)
        mime["Message-ID"] = message_id
        mime["Date"] = formatdate(localtime=False)
        mime["X-OpsWarden-Idempotency-Key"] = idempotency_key
        mime.set_content(message.body)
        if message.html:
            mime.add_alternative(message.html, subtype="html")

        with smtplib.SMTP(self._host, self._port, timeout=20) as smtp:
            if self._use_tls:
                smtp.starttls()
            if self._username:
                smtp.login(self._username, self._password)
            smtp.send_message(mime)
        return SendResult(provider_reference=message_id.strip("<>"))


_provider: EmailProvider | None = None


def get_email_provider() -> EmailProvider:
    global _provider
    if _provider is None:
        if settings.smtp_host and settings.smtp_from:
            _provider = SmtpEmailProvider(
                settings.smtp_host,
                settings.smtp_port,
                settings.smtp_username,
                settings.smtp_password,
                settings.smtp_from,
                settings.smtp_use_tls,
                settings.smtp_from_name,
            )
        else:
            _provider = NullEmailProvider()
    return _provider


def set_email_provider(provider: EmailProvider | None) -> None:
    """Test hook: swap the provider (None resets to configuration)."""
    global _provider
    _provider = provider
