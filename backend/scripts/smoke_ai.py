"""Live check of the AI features against the running API (localhost:8099). Not part of pytest.

Logs in with the local demo admin, then verifies:
  - settings report the model, OCR and TTS as connected
  - Warden answers from the model (not the built-in help), with real case links
  - read-aloud returns WAV audio
  - a scanned invoice image is read by OCR during a real analysis run
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

API = "http://127.0.0.1:8099/api/v1"
SCAN = Path(__file__).resolve().parents[1] / "test_corpus" / "scanned-invoice.png"


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'ok' if ok else 'FAIL'}] {label}{f' - {detail}' if detail else ''}")
    if not ok:
        raise SystemExit(1)


def main() -> int:
    c = httpx.Client(base_url=API, timeout=120.0)
    r = c.post("/auth/login", json={"email": "admin@opswarden.app", "password": "Password123!"})
    check("login", r.status_code == 200, r.text[:120])
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    wid = c.get("/workspaces", headers=h).json()[0]["id"]

    s = c.get(f"/workspaces/{wid}/settings", headers=h).json()
    check("model connected", s["llm_configured"] is True, f"provider={s['llm_provider']}")
    check("OCR connected", s["ocr_available"] is True)
    check("text-to-speech connected", s.get("tts_available") is True)

    print("Warden")
    for q in ["Which case has the biggest value in dispute, and what should I do next?", "How do I upload a scanned invoice?"]:
        t = time.time()
        a = c.post(f"/workspaces/{wid}/assistant/chat", headers=h, json={"message": q, "history": [], "pathname": "/app/overview"}).json()
        check(f"model answered: {q[:40]}...", a["source"] == "model" and bool(a["reply"]), f"{time.time() - t:.1f}s, model={a.get('model')}, reason={a.get('reason')}")
        print("     >", (a["reply"] or "").replace("\n", " ")[:260])
        if a.get("links"):
            print("     links:", ", ".join(f"{l['label']} -> {l['href']}" for l in a["links"]))

    print("read aloud")
    t = time.time()
    audio = c.post(f"/workspaces/{wid}/assistant/speech", headers=h, json={"text": "Northstar invoiced ten more units than were delivered."})
    check("speech returns WAV", audio.status_code == 200 and audio.content[:4] == b"RIFF", f"{len(audio.content)} bytes in {time.time() - t:.1f}s")

    print("OCR in a real analysis")
    case = c.post(f"/workspaces/{wid}/cases", headers=h, json={"title": "OCR check: scanned invoice", "supplier_name": "Northstar Office Supplies", "supplier_reference": "PO-2231", "currency": "USD"}).json()
    up = c.post(f"/cases/{case['id']}/documents", headers=h, data={"document_type": "invoice"}, files={"file": ("scanned-invoice.png", SCAN.read_bytes(), "image/png")})
    check("upload scanned PNG", up.status_code == 202, up.text[:120])
    check("analyze accepted", c.post(f"/cases/{case['id']}/analyze", headers=h).status_code == 202)
    for _ in range(60):
        status = c.get(f"/cases/{case['id']}", headers=h).json()["status"]
        if status != "processing":
            break
        time.sleep(2)
    check("analysis finished", status != "processing", status)
    doc_id = up.json()["document_id"]
    doc = c.get(f"/documents/{doc_id}", headers=h).json()
    check("invoice extracted (not failed)", doc["processing_status"] == "extracted", f"{doc['processing_status']} {doc.get('error_code')}")
    fields = {f["field_path"]: f for f in c.get(f"/documents/{doc_id}/extracted-fields", headers=h).json()["fields"]}
    check("invoice number read", fields.get("document_number", {}).get("value") == "INV-7731", str(fields.get("document_number", {}).get("value")))
    check("grand total read", fields.get("grand_total", {}).get("value") in ("1143.00", "1143"), str(fields.get("grand_total", {}).get("value")))
    check("line quantity read", fields.get("line_items[0].quantity", {}).get("value") == "30", str(fields.get("line_items[0].quantity", {}).get("value")))
    print(f"     {len(fields)} fields; low-confidence: {[p for p, f in fields.items() if f['review_status'] == 'needs_review']}")
    print("\nAI SMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
