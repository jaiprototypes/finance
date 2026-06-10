#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]

from backend.app.config import BACKUP_DIR, DB_PATH
from backend.app.db import session_scope
from backend.app.features.connectors.plaid_client import deduplicate_plaid_links


def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"finance_plaid_dedup_backup_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


def main() -> None:
    backup_path = create_backup()
    with session_scope() as session:
        result = deduplicate_plaid_links(session)
    print(json.dumps({"backup_path": str(backup_path), **result}, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
