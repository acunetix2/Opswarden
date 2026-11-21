"""Text-to-speech for reading assistant answers and case summaries aloud.

Providers (TTS_PROVIDER):
  - gemini  Gemini TTS models (GEMINI_API_KEY). Returns 24 kHz PCM, wrapped as WAV here.
  - groq    Groq Orpheus (LLM_API_KEY). The org admin must accept the model terms first.

Only text the user is already looking at is sent; audio is not stored.
"""
from __future__ import annotations

import base64
import io
import re
import wave

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations import gemini

log = get_logger("opswarden.tts")

MAX_CHARS = 1500
_GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-preview-tts"
_GEMINI_DEFAULT_VOICE = "Kore"
_GROQ_DEFAULT_MODEL = "canopylabs/orpheus-v1-english"
_GROQ_DEFAULT_VOICE = "troy"


class TTSError(Exception):
    pass


def _provider() -> str:
    return settings.tts_provider.lower().strip()


def available() -> bool:
    p = _provider()
    if p == "gemini":
        return gemini.configured()
    if p == "groq":
        return bool(settings.llm_api_key)
    return False


def _speakable(text: str) -> str:
    """Drop markdown symbols and collapse whitespace so the voice doesn't read punctuation."""
    t = re.sub(r"[*_#`>|]+", " ", text)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:MAX_CHARS]


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def synthesize(text: str) -> bytes:
    """Returns WAV audio for `text`."""
    clean = _speakable(text)
    if not clean:
        raise TTSError("Nothing to read aloud")
    p = _provider()
    if p == "gemini":
        return _gemini(clean)
    if p == "groq":
        return _groq(clean)
    raise TTSError("Text-to-speech is not configured")


def _gemini(text: str) -> bytes:
    voice = settings.tts_voice or _GEMINI_DEFAULT_VOICE
    try:
        content = gemini.generate(
            settings.tts_model or _GEMINI_DEFAULT_MODEL,
            [{"text": f"Read this aloud in a clear, calm, professional voice: {text}"}],
            {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}},
        )
    except gemini.GeminiError as exc:
        log.warning("TTS failed: %s", exc)
        raise TTSError("Speech is unavailable right now") from exc
    for part in content.get("parts", []):
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            mime = inline.get("mimeType", "")
            m = re.search(r"rate=(\d+)", mime)
            audio = base64.b64decode(inline["data"])
            return audio if "wav" in mime else _pcm_to_wav(audio, int(m.group(1)) if m else 24000)
    raise TTSError("Speech is unavailable right now")


def _groq(text: str) -> bytes:
    try:
        resp = httpx.post(
            "https://api.groq.com/openai/v1/audio/speech",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json={
                "model": settings.tts_model or _GROQ_DEFAULT_MODEL,
                "voice": settings.tts_voice or _GROQ_DEFAULT_VOICE,
                "input": text,
                "response_format": "wav",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
    except httpx.HTTPError as exc:
        raise TTSError("Speech is unavailable right now") from exc
    if resp.status_code != 200:
        log.warning("Groq TTS returned HTTP %s", resp.status_code)
        raise TTSError("Speech is unavailable right now")
    return resp.content
