from .settings import get_setting

DEFAULT_BASE_CURRENCY = "USD"
SUPPORTED_BASE_CURRENCIES = ("USD", "AUD")


def normalize_base_currency(value: str | None, default: str = DEFAULT_BASE_CURRENCY) -> str:
    normalized = (value or "").strip().upper()
    if not normalized:
        return default
    if normalized in SUPPORTED_BASE_CURRENCIES:
        return normalized
    return default


def get_base_currency(session, default: str = DEFAULT_BASE_CURRENCY) -> str:
    # Budget reports need this cross-feature preference without importing settings.
    value = get_setting(session, "base_currency")
    if value:
        return normalize_base_currency(value, default)
    legacy = get_setting(session, "budget_base_currency")
    if legacy:
        return normalize_base_currency(legacy, default)
    return default
