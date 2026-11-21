"""Fail if any staged file contains a value from backend/.env or a known key format.

Run from the repo root before committing:  backend\\.venv\\Scripts\\python.exe backend\\scripts\\scan_staged_secrets.py
Prints file names and the variable/pattern matched, never the secret itself.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILES = [ROOT / "backend" / ".env", ROOT / "backend" / ".env.bak", ROOT / "frontend" / ".env.local", ROOT / "frontend" / ".env"]
# Values that are configuration, not secrets, even if long.
NOT_SECRET = {"OPSWARDEN_ENV", "DATABASE_URL", "STORAGE_DIR", "LLM_PROVIDER", "LLM_MODEL", "OCR_PROVIDER", "OCR_MODEL",
              "TTS_PROVIDER", "TTS_MODEL", "TTS_VOICE", "SMTP_HOST", "SMTP_FROM", "SMTP_PORT", "SMTP_USE_TLS", "R2_PREFIX",
              "S3_PREFIX", "S3_REGION", "FRONTEND_ORIGIN", "AUTH_PROVIDER", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_AUTH_PROVIDER",
              "R2_BUCKET", "S3_BUCKET", "R2_JURISDICTION", "STORAGE_BACKEND", "MAX_UPLOAD_BYTES", "ACCESS_TOKEN_EXPIRE_MINUTES",
              "PRICE_TOLERANCE", "QUANTITY_TOLERANCE", "LLM_MAX_CALLS_PER_HOUR", "LLM_CACHE_TTL_SECONDS",
              "LLM_ERROR_COOLDOWN_SECONDS", "SEED_DEMO_DATA", "SUPABASE_JWT_AUDIENCE", "BOOTSTRAP_WORKSPACE_NAME",
              "BOOTSTRAP_ADMIN_NAME"}
PATTERNS = {
    "Groq key": r"gsk_[A-Za-z0-9]{20,}",
    "Google key": r"AIza[0-9A-Za-z_\-]{30,}|AQ\.[A-Za-z0-9_\-]{30,}",
    "Brevo key": r"xsmtpsib-[a-f0-9]{20,}|xkeysib-[a-f0-9]{20,}",
    "OpenAI key": r"sk-[A-Za-z0-9]{32,}",
    "JWT": r"eyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}",
    "Postgres URL with password": r"postgres(?:ql)?(?:\+\w+)?://[^:\s/]+:[^@\s<]{6,}@",
    "Private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
}


def env_secrets() -> dict[str, str]:
    out: dict[str, str] = {}
    for f in ENV_FILES:
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8-sig", errors="ignore").splitlines():
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if m and m.group(1) not in NOT_SECRET and len(m.group(2).strip()) >= 8:
                out[f"{f.name}:{m.group(1)}"] = m.group(2).strip()
    return out


def main() -> int:
    files = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    secrets = env_secrets()
    hits: list[str] = []
    for name in files:
        path = ROOT / name
        if not path.is_file():
            continue
        text = path.read_bytes().decode("utf-8", errors="ignore")
        for var, value in secrets.items():
            if value in text:
                hits.append(f"{name}: contains value of {var}")
        for label, pat in PATTERNS.items():
            if re.search(pat, text):
                hits.append(f"{name}: matches {label} pattern")
    print(f"Scanned {len(files)} staged files against {len(secrets)} .env values and {len(PATTERNS)} key patterns.")
    for h in hits:
        print("  !", h)
    print("CLEAN" if not hits else f"{len(hits)} POSSIBLE SECRETS - do not commit")
    return 1 if hits else 0


if __name__ == "__main__":
    raise SystemExit(main())
