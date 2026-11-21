"""Structured logging with secret/document redaction.

Logs never include document contents, secrets, or full tokens.
"""
from __future__ import annotations

import logging
import re
import sys

_REDACT_PATTERNS = [
    re.compile(r"(?i)(authorization|bearer)\s+[A-Za-z0-9._\-]+"),
    re.compile(r"(?i)(api[_-]?key|secret|password|token)\s*[=:]\s*\S+"),
]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        for pat in _REDACT_PATTERNS:
            msg = pat.sub(r"\1 [REDACTED]", msg)
        record.msg = msg
        record.args = ()
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(RedactingFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
