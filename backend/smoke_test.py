"""Live demo-path smoke test against running servers. Not part of pytest.

Usage: python smoke_test.py   (backend on :8099, frontend on :3000)
"""
import sys
import time

import httpx

API = "http://127.0.0.1:8099/api/v1"
WEB = "http://127.0.0.1:3000"
ORIGIN = "http://localhost:3000"


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'ok' if ok else 'FAIL'}] {label}{f' - {detail}' if detail else ''}")
    if not ok:
        raise SystemExit(1)


def main() -> int:
    c = httpx.Client(base_url=API, timeout=30.0)
    print("auth")
    r = c.post("/auth/login", json={"email": "admin@opswarden.app", "password": "Password123!"})
    check("admin login", r.status_code == 200)
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    ws = c.get("/workspaces", headers=h).json()[0]
    wid = ws["id"]

    print("cors")
    pre = c.options("/workspaces", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    check("preflight from frontend origin", pre.headers.get("access-control-allow-origin") == ORIGIN)

    print("read models")
    for path in ["overview?days=30", "cases", "approvals", "documents", "activity", "members", "settings", "suppliers"]:
        r = c.get(f"/workspaces/{wid}/{path}", headers=h)
        check(f"GET /workspaces/:id/{path}", r.status_code == 200)
    ov = c.get(f"/workspaces/{wid}/overview?days=30", headers=h).json()
    print(f"  metrics: {ov['metrics']}")

    cases = {x["supplier_name"]: x for x in c.get(f"/workspaces/{wid}/cases", headers=h).json()}
    check("4 seeded cases", len(cases) == 4, ", ".join(f"{k}={v['status']}" for k, v in cases.items()))

    print("demo path (Northstar)")
    cid = cases["Northstar Office Supplies"]["id"]
    started = time.time()
    r = c.post(f"/cases/{cid}/analyze", headers=h)
    check("analyze returns 202 immediately", r.status_code == 202 and r.json()["status"] == "processing")
    # Live event stream while the background job runs.
    seen = []
    with c.stream("GET", f"/cases/{cid}/events?max_seconds=20&since=2000-01-01T00:00:00Z", headers=h) as s:
        for line in s.iter_lines():
            if line.startswith("event: "):
                seen.append(line[7:])
                if line[7:] in ("investigation.completed", "analysis.failed"):
                    break
    check("event stream reached investigation.completed", "investigation.completed" in seen, f"{len(seen)} events in {time.time() - started:.1f}s")
    status = c.get(f"/cases/{cid}", headers=h).json()["status"]
    check("case left processing", status != "processing", status)
    comp = c.get(f"/cases/{cid}/comparison", headers=h).json()["lines"][0]
    check("ordered/received/invoiced = 50/40/50", (comp["ordered"], comp["received"], comp["invoiced"]) == ("50", "40", "50"))
    summ = c.get(f"/cases/{cid}/summary", headers=h).json()
    check("exposure 120.00 USD", summ["exposure"] == [{"currency": "USD", "amount": "120.00"}])
    findings = c.get(f"/cases/{cid}/findings", headers=h).json()["items"]
    over = next(f for f in findings if f["rule_id"] == "INVOICE_QTY_GT_RECEIVED")
    doc_id = over["evidence"][0]["document_id"]
    check("evidence document readable", c.get(f"/documents/{doc_id}", headers=h).status_code == 200)
    check("extracted fields readable", c.get(f"/documents/{doc_id}/extracted-fields", headers=h).status_code == 200)

    draft = c.post(f"/cases/{cid}/recommendations/email-draft", headers=h).json()
    appr = c.post(f"/recommendations/{draft['recommendation_id']}/request-approval", headers=h,
                  json={"subject": draft["subject"], "body": draft["body"] + "\n\n(edited)", "recipient": None}).json()
    aid = appr["approval_id"]

    con = httpx.post(f"{API}/auth/login", json={"email": "contributor@opswarden.app", "password": "Password123!"}).json()
    ch = {"Authorization": f"Bearer {con['access_token']}"}
    check("contributor cannot approve", c.post(f"/approvals/{aid}/decision", headers=ch, json={"decision": "approve"}).status_code == 403)
    check("cannot execute before approval", c.post(f"/approvals/{aid}/execute", headers=h).status_code == 409)
    c.post(f"/approvals/{aid}/decision", headers=h, json={"decision": "approve"})
    ex = c.post(f"/approvals/{aid}/execute", headers=h).json()
    check("export fallback (not a fake send)", ex["export"] is not None and ex["provider_reference"] is None)

    print("notifications")
    rev = httpx.post(f"{API}/auth/login", json={"email": "reviewer@opswarden.app", "password": "Password123!"}).json()
    rh = {"Authorization": f"Bearer {rev['access_token']}"}
    feed = c.get(f"/workspaces/{wid}/notifications", headers=rh).json()
    check("reviewer sees admin's approval activity", feed["unread_count"] > 0, f"{feed['unread_count']} unread")
    c.post(f"/workspaces/{wid}/notifications/mark-read", headers=rh)
    check("mark read", c.get(f"/workspaces/{wid}/notifications", headers=rh).json()["unread_count"] == 0)

    print("policy")
    s = c.patch(f"/workspaces/{wid}/settings", headers=h, json={"reviewers_can_approve": False}).json()
    check("admin can restrict approvals to admins", s["reviewers_can_approve"] is False)
    c.patch(f"/workspaces/{wid}/settings", headers=h, json={"reviewers_can_approve": True})

    print("team")
    inv = c.post(f"/workspaces/{wid}/invitations", headers=h, json={"email": f"smoke{int(time.time())}@opswarden.app", "role": "contributor"}).json()
    token = inv["invite_url"].split("token=")[1]
    acc = c.post("/invitations/accept", json={"token": token, "password": "smoke-test-42", "full_name": "Smoke Test"})
    check("invite accepted by new user", acc.status_code == 200)
    new_id = next(m["user_id"] for m in c.get(f"/workspaces/{wid}/members", headers=h).json() if m["full_name"] == "Smoke Test")
    check("remove member", c.delete(f"/workspaces/{wid}/members/{new_id}", headers=h).status_code == 204)

    print("password reset")
    rr = c.post("/auth/password-reset/request", json={"email": "contributor@opswarden.app"}).json()
    check("dev reset link issued", bool(rr["dev_reset_url"]))
    rt = rr["dev_reset_url"].split("token=")[1]
    check("reset to the same demo password", c.post("/auth/password-reset/confirm", json={"token": rt, "new_password": "Password123!"}).status_code == 200)

    print("lifecycle")
    kestrel = cases["Kestrel Packaging Co."]["id"]
    check("reopen resolved case", c.post(f"/cases/{kestrel}/reopen", headers=h, json={}).json()["status"] == "needs_review")
    check("archive it", c.post(f"/cases/{kestrel}/archive", headers=h, json={"reason": "smoke"}).json()["status"] == "archived")
    check("reopen archived case", c.post(f"/cases/{kestrel}/reopen", headers=h, json={}).status_code == 200)

    print("frontend routes")
    w = httpx.Client(base_url=WEB, timeout=60.0, follow_redirects=True)
    for route in ["/", "/login", "/forgot-password", "/reset-password?token=x", "/invite?token=x",
                  "/app/overview", "/app/investigations", "/app/investigations/new", f"/app/investigations/{cid}",
                  f"/app/investigations/{cid}/email", f"/app/investigations/{cid}/review",
                  "/app/approvals", "/app/documents", f"/app/documents/{doc_id}", "/app/activity", "/app/suppliers",
                  "/app/team", "/app/settings"]:
        check(f"GET {route}", w.get(route).status_code == 200)

    print("\nSMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
