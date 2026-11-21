"""Help assistant endpoint: membership check and builtin fallback without a model."""

from __future__ import annotations

from tests.test_api_flow import _login, _seed_two_workspaces


def test_assistant_falls_back_when_no_model(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "contrib_a@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat", headers=hdr, json={"message": "How do I approve?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] is None
    assert body["source"] == "builtin"


def test_assistant_is_workspace_scoped(client):
    ids = _seed_two_workspaces()
    hdr_b = _login(client, "admin_b@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat", headers=hdr_b, json={"message": "hi"})
    assert r.status_code == 404


def test_assistant_rejects_empty_and_oversized_messages(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    url = f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat"
    assert client.post(url, headers=hdr, json={"message": ""}).status_code == 422
    assert client.post(url, headers=hdr, json={"message": "x" * 1001}).status_code == 422


def test_transcribe_requires_membership_and_configuration(client):
    from app.core.config import settings

    ids = _seed_two_workspaces()
    hdr_b = _login(client, "admin_b@test.io")
    wav = {"audio": ("speech.wav", b"RIFF0000WAVE", "audio/wav")}
    assert client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/transcribe", headers=hdr_b, files=wav).status_code == 404
    hdr = _login(client, "admin_a@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/transcribe", headers=hdr, files=wav)
    assert r.status_code == 503 and r.json()["error"]["code"] == "STT_UNAVAILABLE"
    assert settings.llm_api_key == ""  # tests never reach a real provider


def test_transcribe_rejects_non_audio(client, monkeypatch):
    from app.services import stt_service

    monkeypatch.setattr(stt_service, "available", lambda: True)
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    url = f"/api/v1/workspaces/{ids['ws_a']}/assistant/transcribe"
    assert client.post(url, headers=hdr, files={"audio": ("x.exe", b"MZ\x90\x00", "application/octet-stream")}).status_code == 415
    assert client.post(url, headers=hdr, files={"audio": ("empty.webm", b"", "audio/webm")}).status_code == 400


def test_reply_naming_a_provider_is_replaced_with_warden_identity(client, monkeypatch):
    from app.agents import llm_provider
    from app.agents.llm_guard import guard
    from app.api.routes import assistant as assistant_routes
    from app.core.config import settings

    class Leaky(llm_provider.LLMProvider):
        name, model = "fake", "fake-model"

        @property
        def configured(self):
            return True

        def complete(self, system, user):
            assert "created by OpsWarden" in system
            return llm_provider.LLMResult(text="I'm ChatGPT, a model trained by OpenAI.", provider="fake", model="fake-model")

    monkeypatch.setattr(assistant_routes, "get_llm_provider", lambda: Leaky())
    guard.reset()
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    r = client.post(f"/api/v1/workspaces/{ids['ws_a']}/assistant/chat", headers=hdr, json={"message": "who made you?"}).json()
    assert r["source"] == "model" and "OpsWarden" in r["reply"] and "OpenAI" not in r["reply"]
    assert settings.llm_api_key == ""
    guard.reset()
