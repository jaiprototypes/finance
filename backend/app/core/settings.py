from sqlalchemy import text


def get_setting(session, key: str, default: str | None = None) -> str | None:
    row = session.execute(
        text("SELECT value FROM app_setting WHERE key = :key"),
        {"key": key},
    ).scalar_one_or_none()
    return str(row) if row is not None else default
