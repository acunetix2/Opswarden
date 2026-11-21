"""Read-only check that every app page renders and the API serves its data. Also archives
the "OCR check" case created by scripts/smoke_ai.py (archiving is reversible)."""
from __future__ import annotations

import sys

import httpx

API = "http://127.0.0.1:8099/api/v1"
WEB = "http://127.0.0.1:3000"


def main() -> int:
    c = httpx.Client(base_url=API, timeout=30)
    h = {"Authorization": "Bearer " + c.post("/auth/login", json={"email": "admin@opswarden.app", "password": "Password123!"}).json()["access_token"]}
    wid = c.get("/workspaces", headers=h).json()[0]["id"]
    cases = c.get(f"/workspaces/{wid}/cases", headers=h).json()
    for x in cases:
        if x["title"].startswith("OCR check") and x["status"] != "archived":
            r = c.post(f"/cases/{x['id']}/archive", headers=h, json={"reason": "AI smoke test case"})
            print("archived test case", x["case_number"], r.status_code)

    failures = 0
    for path in ["overview?days=30", "cases", "approvals", "documents", "activity", "members", "settings", "suppliers", "findings", "notifications"]:
        r = c.get(f"/workspaces/{wid}/{path}", headers=h)
        failures += r.status_code != 200
        print(f"  API {r.status_code} /workspaces/:id/{path}")

    cid = cases[0]["id"]
    docs = c.get(f"/cases/{cid}/documents", headers=h).json()
    routes = ["/", "/login", "/app/overview", "/app/notifications", "/app/investigations", "/app/investigations?status=needs_review",
              "/app/investigations/new", f"/app/investigations/{cid}", f"/app/investigations/{cid}/report", "/app/approvals",
              "/app/findings", "/app/documents", "/app/suppliers", "/app/analytics", "/app/exposure", "/app/activity",
              "/app/team", "/app/settings"] + ([f"/app/documents/{docs[0]['id']}"] if docs else [])
    w = httpx.Client(base_url=WEB, timeout=60, follow_redirects=True)
    for route in routes:
        r = w.get(route)
        failures += r.status_code != 200
        print(f"  WEB {r.status_code} {route}")
    print("ALL ROUTES OK" if not failures else f"{failures} FAILED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
