"""Approval gate: two-phase prepare/approve/execute with payload hashing.

Guarantees from SECURITY.md:
  - The exact proposed payload and its hash are stored.
  - Approval is re-checked (status + payload hash + permission) at execute time.
  - Any edit after approval invalidates the approval.
  - Execution is idempotent via an idempotency key.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_payload(payload: dict[str, Any]) -> str:
    """Deterministic JSON serialization used for hashing/comparison."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def payload_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_payload(payload).encode("utf-8")).hexdigest()


def payload_matches(payload: dict[str, Any], expected_hash: str) -> bool:
    return payload_hash(payload) == expected_hash
