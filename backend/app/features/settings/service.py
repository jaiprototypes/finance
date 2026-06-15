from __future__ import annotations

from passlib.context import CryptContext
from urllib.parse import urlparse

from ...config import (
    LOCAL_AI_BASE_URL,
    LOCAL_AI_ENABLED,
    LOCAL_AI_MODEL,
    LOCAL_AI_TIMEOUT_SECONDS,
)
from ...core.currency import (
    DEFAULT_BASE_CURRENCY,
    SUPPORTED_BASE_CURRENCIES,
    get_base_currency,
    normalize_base_currency,
)
from .models import AppSetting

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
DEFAULT_CLASSIFICATION_MODEL = LOCAL_AI_MODEL
DEFAULT_EMBEDDING_MODEL = "fts5-local"
DEFAULT_LOCAL_AI_BASE_URL = LOCAL_AI_BASE_URL
DEFAULT_LOCAL_AI_TIMEOUT_SECONDS = LOCAL_AI_TIMEOUT_SECONDS
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def get_setting(session, key: str, default: str | None = None) -> str | None:
    row = session.get(AppSetting, key)
    if row:
        return row.value
    return default


def set_setting(session, key: str, value: str) -> None:
    row = session.get(AppSetting, key)
    if row:
        row.value = value
    else:
        session.add(AppSetting(key=key, value=value))


def delete_setting(session, key: str) -> None:
    row = session.get(AppSetting, key)
    if row:
        session.delete(row)


def _bool_value(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(value: str | None, default: int) -> int:
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _is_loopback_url(value: str | None) -> bool:
    if not value:
        return True
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").strip().lower()
    return host in LOOPBACK_HOSTS


def validate_llm_configuration(session) -> None:
    base_url = get_local_ai_base_url(session)
    if base_url and not _is_loopback_url(base_url):
        raise RuntimeError(
            "Local AI base URL must point to a loopback address such as http://127.0.0.1:11434/v1 or http://localhost:11434/v1."
        )
    timeout_seconds = get_local_ai_timeout_seconds(session)
    if timeout_seconds <= 0:
        raise RuntimeError("Local AI timeout must be greater than zero seconds.")


def get_classification_model(session, default: str = DEFAULT_CLASSIFICATION_MODEL) -> str:
    validate_llm_configuration(session)
    model = (
        get_setting(session, "local_ai_model")
        or get_setting(session, "classification_model")
        or get_setting(session, "llm_model")
        or ""
    ).strip()
    if model:
        return model
    return default


def get_embedding_model(session, default: str = DEFAULT_EMBEDDING_MODEL) -> str:
    validate_llm_configuration(session)
    model = (get_setting(session, "embedding_model") or "").strip()
    if model:
        return model
    return default


def get_local_ai_enabled(session, default: bool = LOCAL_AI_ENABLED) -> bool:
    stored = get_setting(session, "local_ai_enabled")
    if stored is not None:
        return _bool_value(stored, default)
    legacy_provider = (get_setting(session, "llm_provider") or "").strip().lower()
    if legacy_provider in {"ollama", "local", "local_service"}:
        return True
    return default


def get_local_ai_base_url(session, default: str = DEFAULT_LOCAL_AI_BASE_URL) -> str:
    value = (
        get_setting(session, "local_ai_base_url")
        or get_setting(session, "llm_endpoint")
        or ""
    ).strip()
    return value or default


def get_local_ai_timeout_seconds(session, default: int = DEFAULT_LOCAL_AI_TIMEOUT_SECONDS) -> int:
    value = (
        get_setting(session, "local_ai_timeout_seconds")
        or get_setting(session, "llm_timeout_seconds")
        or ""
    ).strip()
    return _positive_int(value, default)


def get_local_ai_settings(session) -> dict[str, object]:
    model = get_classification_model(session)
    base_url = get_local_ai_base_url(session)
    enabled = get_local_ai_enabled(session)
    timeout_seconds = get_local_ai_timeout_seconds(session)
    configured = bool(enabled and model and base_url)
    return {
        "enabled": enabled,
        "configured": configured,
        "base_url": base_url,
        "model": model,
        "timeout_seconds": timeout_seconds,
        "embedding_model": get_embedding_model(session),
    }


def set_lock_password(session, password: str) -> None:
    hashed = pwd_context.hash(password)
    set_setting(session, "lock_password_hash", hashed)


def verify_lock_password(session, password: str) -> bool:
    stored = get_setting(session, "lock_password_hash")
    if not stored:
        return False
    return pwd_context.verify(password, stored)
