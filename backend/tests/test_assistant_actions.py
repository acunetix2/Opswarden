"""Warden proposes actions; the server validates them and nothing runs during chat."""
from __future__ import annotations

import pytest

from app.agents import llm_provider
from app.agents.llm_guard import guard
from app.api.routes import assistant as assistant_routes
from app.db import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.case import Case
from app.models.document import Document
from tests.test_api_flow import _login, _seed_two_workspaces


class _Scripted(llm_provider.LLMProvider):
    name, model = "fake", "fake-model"

    def __init__(self, text: str) -> None:
        self.text = text

    @property
    def configured(self):
        return True

    def complete(self, system, user):
        assert "ACTION: <type> <CASE-NUMBER>" in system
        return llm_provider.LLMResult(text=self.text, provider="fake", model="fake-model")


@pytest.fixture(autouse=True)
def _fresh_guard():
    guard.reset()
    yield
    guard.reset()


def _case(client, hdr, ws, title):
    return client.post(f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": title, "currency": "USD"}).json()


def _add_document(case_id: str) -> None:
    db = SessionLocal()
    c = db.get(Case, case_id)
    db.add(Document(
        workspace_id=c.workspace_id, case_id=c.id, document_type="invoice", storage_key="k/opaque",
        original_filename="inv.pdf", mime_type="application/pdf", size_bytes=10, sha256="0" * 64,
        processing_status="completed", uploaded_by=c.created_by,
    ))
    db.commit()
    db.close()


def _chat(client, hdr, ws, message="what next?"):
    r = client.post(f"/api/v1/workspaces/{ws}/assistant/chat", headers=hdr, json={"message": message})
    assert r.status_code == 200, r.text
    return r.json()


def _setup(client):
    ids = _seed_two_workspaces()
    admin = _login(client, "admin_a@test.io")
    with_docs = _case(client, admin, ids["ws_a"], "Has documents")
    _add_document(with_docs["id"])
    empty = _case(client, admin, ids["ws_a"], "No documents")
    analyzed = _case(client, admin, ids["ws_a"], "Analyzed")
    client.post(f"/api/v1/cases/{analyzed['id']}/analyze", headers=admin)
    other_admin = _login(client, "admin_b@test.io")
    for i in range(4):  # push workspace B's numbering past A's
        _case(client, other_admin, ids["ws_b"], f"B{i}")
    return ids, admin, with_docs, empty, analyzed


def test_valid_proposals_survive_and_lines_are_stripped(client, monkeypatch):
    ids, admin, with_docs, empty, analyzed = _setup(client)
    script = (
        f"You can run the match on {with_docs['case_number']} and then write to the supplier.\n"
        f"ACTION: run_analysis {with_docs['case_number']}\n"
        f"ACTION: run_analysis {empty['case_number']}\n"
        f"- ACTION: draft_letter {analyzed['case_number']}\n"
        f"ACTION: delete_case {analyzed['case_number']}\n"
        "ACTION: open_case OW-2026-9999\n"
    )
    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: _Scripted(script))
    body = _chat(client, admin, ids["ws_a"])

    assert "ACTION" not in body["reply"]
    assert body["reply"].startswith("You can run the match")
    got = [(a["type"], a["case_id"]) for a in body["actions"]]
    assert got == [("run_analysis", with_docs["id"]), ("draft_letter", analyzed["id"])]
    assert body["actions"][0]["label"] == f"Run analysis on {with_docs['case_number']}"


def test_chat_never_performs_the_action(client, monkeypatch):
    ids, admin, with_docs, _empty, _analyzed = _setup(client)
    script = f"Ready.\nACTION: run_analysis {with_docs['case_number']}"
    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: _Scripted(script))
    body = _chat(client, admin, ids["ws_a"])
    assert [a["type"] for a in body["actions"]] == ["run_analysis"]

    db = SessionLocal()
    assert db.get(Case, with_docs["id"]).status == "draft"
    started = db.query(AuditEvent).filter(
        AuditEvent.case_id == with_docs["id"], AuditEvent.event_type == "case.status_changed"
    ).count()
    db.close()
    assert started == 0


def test_contributor_gets_only_what_their_role_allows(client, monkeypatch):
    ids, _admin, with_docs, _empty, analyzed = _setup(client)
    contrib = _login(client, "contrib_a@test.io")
    script = (
        "Here is what you can do.\n"
        f"ACTION: draft_letter {analyzed['case_number']}\n"
        f"ACTION: run_analysis {with_docs['case_number']}\n"
        f"ACTION: open_case {analyzed['case_number']}"
    )
    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: _Scripted(script))
    body = _chat(client, contrib, ids["ws_a"])
    # Contributors may run the analysis (EDIT_CASE) but can't prepare supplier letters.
    assert [a["type"] for a in body["actions"]] == ["run_analysis", "open_case"]


def test_case_numbers_resolve_inside_the_callers_workspace_only(client, monkeypatch):
    ids, admin, *_ = _setup(client)
    other = _login(client, "admin_b@test.io")
    b_cases = client.get(f"/api/v1/workspaces/{ids['ws_b']}/cases", headers=other).json()
    b_items = b_cases["items"] if isinstance(b_cases, dict) else b_cases
    only_in_b = max(b_items, key=lambda c: c["case_number"])["case_number"]
    script = f"Look at this.\nACTION: open_case {only_in_b}"
    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: _Scripted(script))
    body = _chat(client, admin, ids["ws_a"])
    assert body["actions"] == []
    assert "ACTION" not in body["reply"]


def test_cached_answers_are_revalidated(client, monkeypatch):
    ids, admin, with_docs, *_ = _setup(client)
    script = f"Go ahead.\nACTION: run_analysis {with_docs['case_number']}"
    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: _Scripted(script))
    assert len(_chat(client, admin, ids["ws_a"], "same question")["actions"]) == 1

    db = SessionLocal()
    db.get(Case, with_docs["id"]).status = "processing"
    db.commit()
    db.close()
    # Same question, same snapshot key is not guaranteed, but any answer must drop the action now.
    assert _chat(client, admin, ids["ws_a"], "same question")["actions"] == []


def test_split_actions_is_strict():
    text, proposals = assistant_routes._split_actions(
        "Answer.\nACTION: open_case OW-2026-0001\naction: RUN_ANALYSIS ow-2026-0002.\nACTION: open_case; drop table\n"
    )
    assert text == "Answer."
    assert proposals == [("open_case", "OW-2026-0001"), ("run_analysis", "OW-2026-0002")]
