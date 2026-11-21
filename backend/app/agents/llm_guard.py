"""Keeps model calls to the minimum that's actually useful.

  - Cache:     identical input (same model + same grounded draft) is answered from
               memory, including rejected rewrites, so we never pay twice.
  - Single-flight: concurrent identical requests (double-clicks) share one call.
  - Cooldown:  after a provider error, calls pause briefly instead of hammering it.
  - Budget:    a hard cap on calls per rolling hour (ARCHITECTURE: bounded spend).

In-process state is fine for the single-API-process MVP; a multi-worker
deployment would move this to Redis.
"""
from __future__ import annotations

import hashlib
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Callable, Generic, TypeVar

from app.core.config import settings

T = TypeVar("T")

_MAX_ENTRIES = 256
_NEGATIVE_TTL_SECONDS = 600


@dataclass
class GuardOutcome(Generic[T]):
    value: T | None
    # Why no call was made: cache_hit | cooling_down | budget_exhausted | None (called)
    skipped: str | None = None


class LLMCallGuard:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self._key_locks: dict[str, threading.Lock] = {}
        self._calls: deque[float] = deque()
        self._cooldown_until = 0.0
        self.calls_made = 0  # observability / tests

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()

    def _get(self, key: str) -> object | None:
        with self._lock:
            hit = self._cache.get(key)
            if not hit:
                return None
            expires, value = hit
            if expires < time.monotonic():
                del self._cache[key]
                return None
            self._cache.move_to_end(key)
            return value

    def put(self, key: str, value: object, *, negative: bool = False) -> None:
        ttl = _NEGATIVE_TTL_SECONDS if negative else settings.llm_cache_ttl_seconds
        with self._lock:
            self._cache[key] = (time.monotonic() + ttl, value)
            self._cache.move_to_end(key)
            while len(self._cache) > _MAX_ENTRIES:
                self._cache.popitem(last=False)

    def report_error(self) -> None:
        with self._lock:
            self._cooldown_until = time.monotonic() + settings.llm_error_cooldown_seconds

    def _reserve_call(self) -> str | None:
        """Returns a skip reason, or None after reserving one call in the budget."""
        now = time.monotonic()
        with self._lock:
            if now < self._cooldown_until:
                return "cooling_down"
            while self._calls and now - self._calls[0] > 3600:
                self._calls.popleft()
            if len(self._calls) >= settings.llm_max_calls_per_hour:
                return "budget_exhausted"
            self._calls.append(now)
            self.calls_made += 1
            return None

    def run(self, key: str, call: Callable[[], T]) -> GuardOutcome[T]:
        """Cached value, or one guarded call. `call` must cache its own result via put()."""
        cached = self._get(key)
        if cached is not None:
            return GuardOutcome(cached, "cache_hit")  # type: ignore[arg-type]
        with self._lock:
            key_lock = self._key_locks.setdefault(key, threading.Lock())
        with key_lock:  # single-flight per input
            cached = self._get(key)
            if cached is not None:
                return GuardOutcome(cached, "cache_hit")  # type: ignore[arg-type]
            reason = self._reserve_call()
            if reason:
                return GuardOutcome(None, reason)
            return GuardOutcome(call(), None)

    def reset(self) -> None:
        with self._lock:
            self._cache.clear()
            self._key_locks.clear()
            self._calls.clear()
            self._cooldown_until = 0.0
            self.calls_made = 0


guard = LLMCallGuard()
