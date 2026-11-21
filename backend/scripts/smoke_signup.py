"""Live check of sign-up against running servers (API :8099, web :3000). Not part of pytest.

Verifies the login page links to sign-up, the sign-up page renders, and the
emailed-code flow creates an account and workspace whose admin can invite staff.
Without SMTP (development) the API returns the code so the flow can finish here.
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
    w = httpx.Client(base_url=WEB, timeout=60, follow_redirects=True)
    login = w.get("/login")
    check("login page links to sign-up", login.status_code == 200 and 'href="/signup"' in login.text)
    signup = w.get("/signup")
    check("sign-up page renders", signup.status_code == 200 and "Create your account" in signup.text)

    c = httpx.Client(base_url=API, timeout=60)
    check("API reports sign-up on", c.get("/auth/config").json().get("allow_signup") is True)
    email = f"signup-check-{int(time.time())}@example.com"
    start = c.post("/auth/signup/start", json={"full_name": "Signup Check", "email": email, "password": "check-pass-42", "workspace_name": "Signup Check Ltd"})
    check("code requested", start.status_code == 202, start.text[:160])
    s = start.json()
    if not s.get("dev_code"):
        print("  [info] code was emailed (SMTP configured); finish the flow in the browser.")
        return 0
    wrong = c.post("/auth/signup/verify", json={"verification_id": s["verification_id"], "code": f"{(int(s['dev_code']) + 1) % 10**6:06d}"})
    check("wrong code refused", wrong.status_code == 400, wrong.json()["error"]["message"])
    done = c.post("/auth/signup/verify", json={"verification_id": s["verification_id"], "code": s["dev_code"]})
    check("right code creates the account", done.status_code == 201, done.text[:160])
    h = {"Authorization": f"Bearer {done.json()['access_token']}"}
    ws = c.get("/workspaces", headers=h).json()
    check("new user is admin of their own workspace only", ws == [{"id": done.json()["workspace_id"], "name": "Signup Check Ltd", "role": "admin"}], str(ws))
    inv = c.post(f"/workspaces/{ws[0]['id']}/invitations", headers=h, json={"email": f"reviewer-{email}", "role": "reviewer"})
    check("admin can invite a reviewer", inv.status_code in (200, 201), inv.text[:160])
    print("\nSIGN-UP SMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
