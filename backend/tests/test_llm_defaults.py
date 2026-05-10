import pytest

from backend.app.api import settings as settings_api
from backend.app.schemas import SettingsUpdate
from backend.app.services import classification
from backend.app.services.settings import get_setting, set_setting, validate_llm_configuration
from backend.tests.utils import make_session


def _neutral_payload() -> dict:
    return {
        "description": "Cafe Example",
        "payee": "",
        "notes": "",
        "amount": -12.5,
        "currency": "USD",
    }


def test_settings_return_local_ai_defaults():
    session = make_session()

    data = settings_api.get_settings(session)

    assert data["local_ai_enabled"] is False
    assert data["local_ai_base_url"] == "http://127.0.0.1:11434/v1"
    assert data["local_ai_model"] == "qwen2.5:7b-instruct"
    assert data["classification_model"] == "qwen2.5:7b-instruct"
    assert data["embedding_model"] == "fts5-local"


def test_settings_read_legacy_local_model_values():
    session = make_session()
    set_setting(session, "llm_provider", "ollama")
    set_setting(session, "llm_model", "llama3.1:8b")
    set_setting(session, "llm_endpoint", "http://127.0.0.1:11434/v1")
    session.commit()

    data = settings_api.get_settings(session)

    assert data["local_ai_enabled"] is True
    assert data["local_ai_model"] == "llama3.1:8b"
    assert data["local_ai_base_url"] == "http://127.0.0.1:11434/v1"


def test_classification_uses_local_ai_when_enabled(monkeypatch):
    session = make_session()
    set_setting(session, "local_ai_enabled", "true")
    session.commit()
    calls: list[str] = []

    def fake_local_ai_call(_session, prompt: str):
        calls.append(prompt)
        return {
            "category": "Restaurants & Cafes",
            "classification": "Personal",
            "merchant_name": "Cafe Example",
            "note": "Grounded local categorization.",
        }

    monkeypatch.setattr(classification, "_local_ai_call", fake_local_ai_call)

    result = classification.classify_payload(session, _neutral_payload())

    assert result["source"] == "local_ai"
    assert result["category_name"] == "Food"
    assert calls
    assert "Cafe Example" in calls[0]


def test_classification_gracefully_falls_back_when_local_ai_unavailable(monkeypatch):
    session = make_session()
    set_setting(session, "local_ai_enabled", "true")
    session.commit()

    monkeypatch.setattr(classification, "_local_ai_call", lambda _session, prompt: None)

    result = classification.classify_payload(session, _neutral_payload())

    assert result["source"] == "unknown"
    assert result["category_name"] is None


def test_updating_local_ai_settings_clears_legacy_llm_settings():
    session = make_session()
    set_setting(session, "llm_provider", "ollama")
    set_setting(session, "llm_model", "llama3.1:8b")
    set_setting(session, "llm_endpoint", "http://127.0.0.1:11434")
    session.commit()

    settings_api.update_settings(
        SettingsUpdate(
            local_ai_enabled=True,
            local_ai_base_url="http://127.0.0.1:11434/v1",
            local_ai_model="qwen2.5:7b-instruct",
            local_ai_timeout_seconds=45,
            embedding_model="fts5-local",
        ),
        session,
    )

    assert get_setting(session, "local_ai_enabled") == "true"
    assert get_setting(session, "local_ai_base_url") == "http://127.0.0.1:11434/v1"
    assert get_setting(session, "local_ai_model") == "qwen2.5:7b-instruct"
    assert get_setting(session, "local_ai_timeout_seconds") == "45"
    assert get_setting(session, "embedding_model") == "fts5-local"
    assert get_setting(session, "llm_provider") is None
    assert get_setting(session, "llm_model") is None
    assert get_setting(session, "llm_endpoint") is None


def test_validation_rejects_non_loopback_local_ai_base_url():
    session = make_session()
    set_setting(session, "local_ai_base_url", "https://api.openai.com/v1")
    session.commit()

    with pytest.raises(RuntimeError, match="loopback address"):
        validate_llm_configuration(session)
