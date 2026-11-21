"""Check the configured LLM provider end to end. Never prints the API key.

Usage (from backend/):  .venv\\Scripts\\python.exe scripts\\check_llm.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.agents.llm_provider import LLMError, get_llm_provider  # noqa: E402
from app.core.config import settings  # noqa: E402


def main() -> int:
    provider = get_llm_provider()
    print(f"LLM_PROVIDER={settings.llm_provider!r} LLM_MODEL={settings.llm_model!r} key set: {bool(settings.llm_api_key)}")
    print(f"Resolved provider: {type(provider).__name__} (configured={provider.configured})")
    if not provider.configured:
        print("No key configured: drafts and the assistant use the built-in templates.")
        return 1

    if settings.llm_provider.lower().strip() == "groq":
        resp = httpx.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            timeout=30,
        )
        print(f"GET /models -> HTTP {resp.status_code}")
        if resp.status_code == 200:
            ids = sorted(m["id"] for m in resp.json().get("data", []))
            print("Models on this key:", ", ".join(ids))
            print(f"Configured model available: {settings.llm_model in ids}")
        else:
            print(resp.text[:400])

    try:
        result = provider.complete("Reply with exactly the two words: GROQ OK", "Say it.")
    except LLMError as exc:
        print(f"Completion failed: {exc}")
        return 2
    print(f"Completion via {result.provider}/{result.model}: {result.text!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
