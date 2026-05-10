import os
from pathlib import Path

from platformdirs import user_data_dir


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


APP_NAME = os.getenv("APP_NAME", "Finances")
APP_AUTHOR = os.getenv("APP_AUTHOR", "JAI")

APP_DATA_DIR = Path(os.getenv("APP_DATA_DIR", user_data_dir(APP_NAME, APP_AUTHOR)))
DB_PATH = APP_DATA_DIR / "finance.db"
LOG_DIR = APP_DATA_DIR / "logs"
UPLOADS_DIR = APP_DATA_DIR / "uploads"
BACKUP_DIR = APP_DATA_DIR / "backups"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

FX_PROVIDER = os.getenv("FX_PROVIDER", "rba")

PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID", "")
PLAID_SECRET = os.getenv("PLAID_SECRET", "")
PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")
PLAID_REDIRECT_URI = os.getenv("PLAID_REDIRECT_URI", "")

UP_API_KEY = os.getenv("UP_API_KEY", "")

LOCAL_AI_ENABLED = _env_bool("LOCAL_AI_ENABLED", False)
LOCAL_AI_BASE_URL = os.getenv("LOCAL_AI_BASE_URL", "http://127.0.0.1:11434/v1")
LOCAL_AI_MODEL = os.getenv("LOCAL_AI_MODEL", "qwen2.5:7b-instruct")
LOCAL_AI_TIMEOUT_SECONDS = _env_int("LOCAL_AI_TIMEOUT_SECONDS", 30)
LOCAL_AI_API_KEY = os.getenv("LOCAL_AI_API_KEY", "")

APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
