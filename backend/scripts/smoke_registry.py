"""Live check of the supplier/PO register, search and new UI routes against running servers.

Registers a supplier and a PO (with a small PDF), opens a case from the PO, and
confirms the PO file was attached, the supplier letter is addressed from the
register, search finds them, and the new pages render. Records it creates are
labelled "Register check" so they're easy to spot.
"""
from __future__ import annotations

import sys
import time

import httpx

API = "http://127.0.0.1:8099/api/v1"
WEB = "http://127.0.0.1:3000"


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'ok' if ok else 'FAIL'}] {label}{f' - {detail}' if detail else ''}")
    if not ok:
        raise SystemExit(1)


def main() -> int:
    c = httpx.Client(base_url=API, timeout=60)
    h = {"Authorization": "Bearer " + c.post("/auth/login", json={"email": "admin@opswarden.app", "password": "Password123!"}).json()["access_token"]}
    wid = c.get("/workspaces", headers=h).json()[0]["id"]
    stamp = int(time.time())

    s = c.post(f"/workspaces/{wid}/registry/suppliers", headers=h, json={"name": f"Register check {stamp}", "contact_email": "ap@register-check.example", "default_currency": "KES"})
    check("register supplier", s.status_code == 201, s.text[:120])
    sid = s.json()["id"]
    po = c.post(f"/workspaces/{wid}/registry/purchase-orders", headers=h, json={"supplier_id": sid, "po_number": f"PO-RC-{stamp}", "total_amount": "12500.00", "description": "Register check order"})
    check("register purchase order", po.status_code == 201 and po.json()["currency"] == "KES", po.text[:120])
    pid = po.json()["id"]
    f = c.put(f"/registry/purchase-orders/{pid}/file", headers=h, files={"file": ("po.pdf", b"%PDF-1.4\n% register check\n", "application/pdf")})
    check("attach PO file", f.status_code == 200 and f.json()["has_file"])

    case = c.post(f"/workspaces/{wid}/cases", headers=h, json={"purchase_order_id": pid})
    check("open case from PO", case.status_code == 201, case.text[:120])
    cid = case.json()["id"]
    docs = c.get(f"/cases/{cid}/documents", headers=h).json()
    check("PO file attached to the case", [d["document_type"] for d in docs] == ["purchase_order"])
    check("supplier filled from register", case.json()["supplier_name"] == f"Register check {stamp}" and case.json()["currency"] == "KES")

    hits = c.get(f"/workspaces/{wid}/search", headers=h, params={"q": f"RC-{stamp}"}).json()["hits"]
    check("search finds the PO and case", {"purchase_order", "case"} <= {x["kind"] for x in hits}, str([x["kind"] for x in hits]))
    s2 = c.get(f"/workspaces/{wid}/settings", headers=h).json()
    check("voice input reported", s2.get("stt_available") is True)

    w = httpx.Client(base_url=WEB, timeout=60, follow_redirects=True)
    for route in ["/app/suppliers", "/app/purchase-orders", f"/app/investigations/new?supplier={sid}", f"/app/investigations/{cid}"]:
        check(f"GET {route}", w.get(route).status_code == 200)

    c.post(f"/cases/{cid}/archive", headers=h, json={"reason": "register check"})
    c.patch(f"/registry/suppliers/{sid}", headers=h, json={"is_active": False})
    print("\nREGISTER SMOKE TEST PASSED (test supplier set inactive, test case archived)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
