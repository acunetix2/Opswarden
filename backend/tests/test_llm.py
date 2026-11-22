"""Gemma provider and AI-draft grounding. The network is mocked; no real key is used."""
from __future__ import annotations

import json

import httpx
import pytest

from app.agents import llm_provider
from app.agents.llm_guard import guard as llm_guard
from app.core.config import settings
from app.services.investigation_service import build_email_draft, grounding_problem
from tests.test_access import _case, _upload
from tests.test_api_flow import _login, _seed_two_workspaces

FAKE_KEY = "test-key-not-real"


@pytest.fixture()
def gemma(monkeypatch):
    """Configure Gemma and capture outgoing requests; tests set the reply."""
    monkeypatch.setattr(settings, "llm_provider", "gemma")
    monkeypatch.setattr(settings, "llm_api_key", FAKE_KEY)
    monkeypatch.setattr(settings, "llm_model", "gemma-3-27b-it")
    state: dict = {"calls": [], "reply": None, "status": 200}

    def fake_post(url, headers=None, json=None, timeout=None):
        state["calls"].append({"url": url, "headers": headers, "json": json})
        if state["status"] != 200:
            return httpx.Response(state["status"], json={"error": {"message": "boom"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": state["reply"]}]}}]})

    monkeypatch.setattr(llm_provider.httpx, "post", fake_post)
    llm_guard.reset()
    yield state
    llm_guard.reset()


GOOD_REPLY = (
    "Hello Northstar,\n\nWhile reviewing PO-1048 we noticed the invoice lists 50 units of Product B, "
    "but the delivery receipt records 40. We also ordered 50 units and received 40. The difference is 10 units.\n\n"
    "Could you confirm the correct quantity?\n\nThank you,\nProcurement Team"
)


def _northstar(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    # These tests count model calls for hand-drafted letters, so the automatic draft after analysis is off.
    client.patch(f"/api/v1/workspaces/{ids['ws_a']}/settings", headers=hdr, json={"auto_draft_letters": False})
    case = _case(client, hdr, ids["ws_a"], supplier_name="Northstar", supplier_reference="PO-1048")
    _upload(client, hdr, case["id"], "purchase_order", {"supplier_name": "Northstar", "document_number": "PO-1048", "currency": "USD", "line_items": [{"sku": "B", "description": "Product B", "quantity": "50", "unit_price": "12.00"}]})
    _upload(client, hdr, case["id"], "delivery_receipt", {"supplier_name": "Northstar", "purchase_order_reference": "PO-1048", "line_items": [{"sku": "B", "received_quantity": "40"}]})
    _upload(client, hdr, case["id"], "invoice", {"supplier_name": "Northstar", "document_number": "INV-8821", "purchase_order_reference": "PO-1048", "currency": "USD", "line_items": [{"sku": "B", "description": "Product B", "quantity": "50", "unit_price": "12.00"}]})
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=hdr)
    return hdr, case


def test_gemma_request_shape_and_accepted_rewrite(client, gemma):
    hdr, case = _northstar(client)
    gemma["reply"] = GOOD_REPLY
    r = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()
    assert r["ai_assisted"] is True and r["model"] == "gemma-3-27b-it"
    assert r["body"].startswith("Hello Northstar")

    call = gemma["calls"][0]
    assert call["url"].endswith("/v1beta/models/gemma-3-27b-it:generateContent")
    assert call["headers"]["x-goog-api-key"] == FAKE_KEY
    assert FAKE_KEY not in call["url"]  # key never in the URL
    assert "systemInstruction" not in call["json"] and "system_instruction" not in call["json"]
    prompt = call["json"]["contents"][0]["parts"][0]["text"]
    assert prompt.startswith(llm_provider.SYSTEM_GUARDRAIL)

    # Audit records provider metadata, not the model output.
    events = client.get(f"/api/v1/cases/{case['id']}/activity", headers=hdr).json()
    gen = next(e for e in events if e["event_type"] == "recommendation.generated")
    assert gen["payload"]["provider"] == "gemma" and gen["payload"]["ai_assisted"] is True
    assert "body" not in json.dumps(gen["payload"])


def test_rewrite_with_invented_number_falls_back(client, gemma):
    hdr, case = _northstar(client)
    gemma["reply"] = "Hello Northstar, about PO-1048: please credit us 999 USD for the 10 missing units."
    r = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()
    assert r["ai_assisted"] is False and r["fallback_reason"] == "new_numbers"
    assert "999" not in r["body"] and r["body"].startswith("Hello Northstar,")


def test_provider_error_falls_back(client, gemma):
    hdr, case = _northstar(client)
    gemma["status"] = 503
    r = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr)
    assert r.status_code == 200
    assert r.json()["ai_assisted"] is False and r.json()["fallback_reason"] == "provider_error"


def test_no_key_means_no_network(client, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemma")
    monkeypatch.setattr(settings, "llm_api_key", "")

    def explode(*a, **k):
        raise AssertionError("network must not be called without a key")

    monkeypatch.setattr(llm_provider.httpx, "post", explode)
    hdr, case = _northstar(client)
    r = client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()
    assert r["ai_assisted"] is False and r["fallback_reason"] is None


def test_grounding_rules():
    draft = "Hello,\nPO-1048: invoice lists 50 units, receipt records 40. Unit price 12.00.\nThanks"
    assert grounding_problem(draft, "Hi, on PO-1048 the invoice shows 50 but 40 arrived at 12 each.", "PO-1048") is None
    assert grounding_problem(draft, "Hi, on PO-1048 the invoice shows 55 units.", "PO-1048") == "new_numbers"
    assert grounding_problem(draft, "Hi, the invoice shows 50 but 40 arrived.", "PO-1048") == "reference_missing"
    assert grounding_problem(draft, "PO-1048: reply to billing@evil.example", "PO-1048") == "new_contact_or_link"
    assert grounding_problem(draft, "PO-1048 see https://evil.example", "PO-1048") == "new_contact_or_link"
    assert grounding_problem(draft, "", "PO-1048") == "empty"


def test_deterministic_draft_unchanged_without_provider():
    subject, body = build_email_draft("OW-1", "Acme", "PO-9", [], "USD")
    assert subject == "Clarification requested for PO-9 (OW-1)" and "PO-9" in body


# ---- Call optimization ---------------------------------------------------------------


def _draft(client, hdr, case):
    return client.post(f"/api/v1/cases/{case['id']}/recommendations/email-draft", headers=hdr).json()


def test_repeat_drafts_use_cache(client, gemma):
    hdr, case = _northstar(client)
    gemma["reply"] = GOOD_REPLY
    first, second, third = (_draft(client, hdr, case) for _ in range(3))
    assert len(gemma["calls"]) == 1
    assert first["body"] == second["body"] == third["body"] and third["ai_assisted"] is True


def test_rejected_rewrite_is_not_retried(client, gemma):
    hdr, case = _northstar(client)
    gemma["reply"] = "PO-1048: please credit 999 USD."
    assert _draft(client, hdr, case)["fallback_reason"] == "new_numbers"
    assert _draft(client, hdr, case)["fallback_reason"] == "new_numbers"
    assert len(gemma["calls"]) == 1


def test_findings_change_triggers_a_new_call(client, gemma):
    hdr, case = _northstar(client)
    gemma["reply"] = GOOD_REPLY
    _draft(client, hdr, case)
    findings = client.get(f"/api/v1/cases/{case['id']}/findings", headers=hdr).json()["items"]
    client.post(f"/api/v1/findings/{findings[0]['id']}/review", headers=hdr, json={"decision": "dismiss", "comment": "Credit note received"})
    _draft(client, hdr, case)
    assert len(gemma["calls"]) == 2  # different grounded draft -> different cache key


def test_provider_error_starts_cooldown(client, gemma):
    hdr, case = _northstar(client)
    gemma["status"] = 503
    assert _draft(client, hdr, case)["fallback_reason"] == "provider_error"
    gemma["status"] = 200
    gemma["reply"] = GOOD_REPLY
    assert _draft(client, hdr, case)["fallback_reason"] == "cooling_down"
    assert len(gemma["calls"]) == 1


def test_hourly_budget_caps_calls(client, gemma, monkeypatch):
    monkeypatch.setattr(settings, "llm_max_calls_per_hour", 1)
    hdr, case = _northstar(client)
    gemma["reply"] = "Rejected 777"  # never cached as success; forces distinct work
    _draft(client, hdr, case)
    llm_guard._cache.clear()  # simulate a different input without changing the case
    assert _draft(client, hdr, case)["fallback_reason"] == "budget_exhausted"
    assert len(gemma["calls"]) == 1


def test_no_call_when_nothing_to_rephrase(client, gemma):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _case(client, hdr, ids["ws_a"])
    r = _draft(client, hdr, case)
    assert r["fallback_reason"] == "not_needed" and gemma["calls"] == []
