from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmailMessage:
    recipient: str
    subject: str
    body: str
    # Optional HTML alternative. `body` stays the plain-text version every client can show.
    html: str | None = None
    # Where replies go (the workspace inbox for supplier letters).
    reply_to: str | None = None


@dataclass
class SendResult:
    provider_reference: str
    status: str = "sent"


class EmailProvider(ABC):
    @property
    @abstractmethod
    def configured(self) -> bool: ...

    @abstractmethod
    def send(self, message: EmailMessage, idempotency_key: str) -> SendResult: ...
