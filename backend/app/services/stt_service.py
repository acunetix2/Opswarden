"""Speech-to-text for talking to Warden.

Uses Groq's hosted Whisper (STT_PROVIDER=groq, key from LLM_API_KEY). Recordings
are sent once for transcription and never stored. Whisper is known to invent
filler phrases ("Thank you.", "Thanks for watching!") on silent clips, so those
are treated as "nothing said".
"""
from __future__ import annotations

import re

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("opswarden.stt")

MAX_BYTES = 10 * 1024 * 1024
ACCEPTED_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "video/webm": "webm",  # some browsers label audio-only recordings this way
}
_DEFAULT_MODEL = "whisper-large-v3-turbo"
_HALLUCINATIONS = {
    "thank you", "thank you.", "thanks for watching", "thanks for watching!", "thank you for watching",
    "you", "bye", "bye.", ".", "okay", "ok", "so", "uh", "um",
}


class STTError(Exception):
    pass


def available() -> bool:
    return settings.stt_provider.lower().strip() == "groq" and bool(settings.llm_api_key)


def transcribe(data: bytes, mime: str) -> str:
    """Returns the spoken text, or "" if nothing intelligible was said."""
    ext = ACCEPTED_TYPES.get(mime, "webm")
    try:
        resp = httpx.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            data={
                "model": settings.stt_model or _DEFAULT_MODEL,
                "response_format": "json",
                "temperature": "0",
                # Domain words make Whisper spell them correctly.
                "prompt": "OpsWarden, Warden, purchase order, PO, invoice, delivery receipt, supplier, finding, case, approval.",
                **({"language": settings.stt_language} if settings.stt_language else {}),
            },
            files={"file": (f"speech.{ext}", data, mime)},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
    except httpx.HTTPError as exc:
        raise STTError("Voice input is unavailable right now.") from exc
    if resp.status_code != 200:
        log.warning("Transcription returned HTTP %s", resp.status_code)
        raise STTError("Voice input is unavailable right now.")
    text = re.sub(r"\s+", " ", str(resp.json().get("text", ""))).strip()
    if text.lower().strip(" !?") in _HALLUCINATIONS or not re.search(r"[A-Za-z0-9]", text):
        return ""
    return text[:1000]
