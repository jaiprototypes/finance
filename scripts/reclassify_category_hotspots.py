#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, or_, select, text

from backend.app.config import BACKUP_DIR, DB_PATH
from backend.app.db import init_db, session_scope
from backend.app.features.classification.service import apply_classification, build_transaction_payload, classify_payload
from backend.app.features.classification.models import ClassificationAudit, MerchantProfile, TransactionMemory
from backend.app.features.ledger.models import Transaction, TransactionSplit


ATM_DESCRIPTIONS = (
    "ATM Cash Out",
    "International ATM Cash Out",
    "ATM Operator Fee",
)

MERCHANT_PATTERNS = (
    "%afterpay%",
    "%ranier%",
    "%t nguyen%",
    "%thi hoang phung nguyen%",
    "%monash universit%",
    "%readygrad%",
    "%amazon web services%",
    "%bank of melbourne account%",
    "%belmont city medical%",
    "%city electric suppl%",
    "%ausrec wa pty ltd%",
)


def now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"finance_hotspot_reclassify_backup_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


def purge_transaction_state(session, transaction_id: int) -> None:
    session.execute(delete(TransactionSplit).where(TransactionSplit.transaction_id == transaction_id))
    memory_rows = session.execute(
        select(TransactionMemory.id).where(TransactionMemory.transaction_id == transaction_id)
    ).all()
    memory_ids = [row[0] for row in memory_rows]
    if memory_ids:
        session.execute(
            TransactionMemory.__table__.delete().where(TransactionMemory.id.in_(memory_ids))
        )
        for memory_id in memory_ids:
            session.execute(text("DELETE FROM transaction_memory_fts WHERE rowid = :row_id"), {"row_id": memory_id})
    session.execute(delete(ClassificationAudit).where(ClassificationAudit.transaction_id == transaction_id))


def target_transaction_ids(session) -> list[int]:
    rows = session.execute(
        select(Transaction.id).where(
            or_(
                Transaction.description.in_(ATM_DESCRIPTIONS),
                *[Transaction.payee.ilike(pattern) for pattern in MERCHANT_PATTERNS],
                *[Transaction.description.ilike(pattern) for pattern in MERCHANT_PATTERNS],
            )
        )
    ).all()
    return sorted({int(row[0]) for row in rows})


def purge_bad_profiles(session) -> int:
    rows = session.execute(
        select(MerchantProfile.id).where(
            or_(
                *[MerchantProfile.name.ilike(pattern) for pattern in MERCHANT_PATTERNS],
                MerchantProfile.name.ilike("%cash out%"),
                MerchantProfile.name.ilike("%atm%"),
            )
        )
    ).all()
    ids = [int(row[0]) for row in rows]
    if ids:
        session.execute(delete(MerchantProfile).where(MerchantProfile.id.in_(ids)))
    return len(ids)


def main() -> None:
    init_db()
    backup = create_backup()
    summary: dict[str, object] = {
        "backup_path": str(backup),
        "profile_purged": 0,
        "transactions_reclassified": 0,
        "category_counts": {},
        "errors": [],
    }
    with session_scope() as session:
        summary["profile_purged"] = purge_bad_profiles(session)
        txn_ids = target_transaction_ids(session)
        category_counts: dict[str, int] = {}
        errors: list[dict[str, object]] = []
        for txn_id in txn_ids:
            txn = session.execute(select(Transaction).where(Transaction.id == txn_id)).scalar_one_or_none()
            if not txn:
                continue
            try:
                purge_transaction_state(session, txn_id)
                result = classify_payload(session, build_transaction_payload(session, txn))
                apply_classification(session, txn_id, result)
                if result.get("category_id"):
                    txn.reconciliation_state = "verified"
                txn.updated_at = now_str()
                key = str(result.get("category_name") or "Uncategorized")
                category_counts[key] = category_counts.get(key, 0) + 1
                summary["transactions_reclassified"] = int(summary["transactions_reclassified"]) + 1
            except Exception as exc:
                errors.append({"transaction_id": txn_id, "error": str(exc)})
        summary["category_counts"] = category_counts
        summary["errors"] = errors
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
