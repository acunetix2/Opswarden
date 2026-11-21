"""Minimal Google Gemini client shared by OCR and text-to-speech.

The key travels in a header, never in the URL, so it can't end up in access logs.
Errors carry the HTTP status and Google's short message, never the request body.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
_TIMEOUT = httpx.Timeout(90.0, connect=10.0)


class GeminiError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def configured() -> bool:
    return bool(settings.gemini_api_key)


def generate(model: str, parts: list[dict[str, Any]], generation_config: dict[str, Any]) -> dict[str, Any]:
    """POST models/{model}:generateContent and return the first candidate's content."""
    if not configured():
        raise GeminiError("GEMINI_API_KEY is not set")
    try:
        resp = httpx.post(
            f"{BASE_URL}/{model}:generateContent",
            headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            json={"contents": [{"role": "user", "parts": parts}], "generationConfig": generation_config},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise GeminiError(f"Gemini request failed: {type(exc).__name__}") from exc
    if resp.status_code != 200:
        try:
            detail = str((resp.json().get("error") or {}).get("message", ""))[:160]
        except ValueError:
            detail = ""
        raise GeminiError(f"Gemini returned HTTP {resp.status_code}{f': {detail}' if detail else ''}", resp.status_code)
    candidates = resp.json().get("candidates") or []
    if not candidates:
        raise GeminiError("Gemini returned no candidates (possibly blocked)")
    return candidates[0].get("content") or {}
