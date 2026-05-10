from __future__ import annotations

from pathlib import Path
from sqlalchemy import text

MIGRATIONS_DIR = Path(__file__).parent / "sql"


def _ensure_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
    )


def _applied_versions(conn) -> set[str]:
    rows = conn.execute(text("SELECT version FROM schema_migrations")).fetchall()
    return {row[0] for row in rows}


def apply_migrations(engine) -> None:
    MIGRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        return
    with engine.begin() as conn:
        _ensure_table(conn)
        applied = _applied_versions(conn)
        for path in files:
            version = path.stem
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            statements = [s.strip() for s in sql.split(";") if s.strip()]
            for stmt in statements:
                conn.exec_driver_sql(stmt)
            conn.execute(
                text("INSERT INTO schema_migrations(version, applied_at) VALUES(:v, datetime('now'))"),
                {"v": version},
            )

