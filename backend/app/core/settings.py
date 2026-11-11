from sqlalchemy import text


def get_setting(session, key: str, default: str | None = None) -> str | None:
    row = session.execute(
        text("SELECT value FROM app_setting WHERE key = :key"),
        {"key": key},
    ).scalar_one_or_none()
    return str(row) if row is not None else default


def set_setting(session, key: str, value: str) -> None:
    """Write a shared preference without importing the settings feature's ORM model."""
    session.flush()
    session.execute(text(
        "INSERT INTO app_setting (key, value) VALUES (:key, :value) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ), {"key": key, "value": value})
    # Keep existing feature-level ORM reads coherent with this direct write.
    for row in list(session.identity_map.values()):
        if getattr(type(row), "__tablename__", None) == "app_setting" and row.key == key:
            session.expire(row, ["value"])
