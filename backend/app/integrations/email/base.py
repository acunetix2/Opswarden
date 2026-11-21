from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmailMessage:
    recipient: str
    subject: str
    body: str


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
