#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


for env_name in (".env.local_ai", ".env.plaid", ".env.up"):
    load_env_file(ROOT_DIR / "backend" / env_name)

from sqlalchemy import select, text

from backend.app.config import BACKUP_DIR, DB_PATH
from backend.app.db import init_db, session_scope
from backend.app.features.classification.service import (
    apply_classification,
    build_transaction_payload,
    classify_payload,
    is_legacy_opening_transaction,
)
from backend.app.features.classification.models import ClassificationAudit, MerchantProfile, TransactionMemory
from backend.app.features.ledger.models import Transaction, TransactionSplit
from backend.app.features.taxonomy.models import Category


TRANSFER_LIKE_TERMS = ("transfer", "wise", "payid", "osko", "wire", "remit", "xfer", "bpay")


def now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"finance_reclassify_backup_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


def category_map(session) -> dict[int, str]:
    return {row.id: row.name for row in session.execute(select(Category)).scalars().all()}


def current_category_name(session, txn_id: int, categories: dict[int, str]) -> str | None:
    split = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == txn_id)
    ).scalar_one_or_none()
    if not split or not split.category_id:
        return None
    return categories.get(split.category_id)


def payload_transfer_like(payload: dict[str, Any]) -> bool:
    fields = [
        payload.get("payee") or "",
        payload.get("description") or "",
        payload.get("notes") or "",
        payload.get("bank_category") or "",
        payload.get("pfc_primary") or "",
        payload.get("pfc_detailed") or "",
        payload.get("mcc") or "",
    ]
    haystack = " ".join(str(field).lower() for field in fields if field)
    return any(term in haystack for term in TRANSFER_LIKE_TERMS)


def snapshot_before() -> dict[str, Any]:
    with session_scope() as session:
        categories = category_map(session)
        txns = (
            session.execute(select(Transaction).order_by(Transaction.date, Transaction.id))
            .scalars()
            .all()
        )
        transfer_like_rows: list[dict[str, Any]] = []
        all_txn_ids: list[int] = []
        for txn in txns:
            if is_legacy_opening_transaction(txn.description, txn.notes, txn.payee):
                continue
            all_txn_ids.append(txn.id)
            payload = build_transaction_payload(session, txn)
            if not payload_transfer_like(payload):
                continue
            transfer_like_rows.append(
                {
                    "id": txn.id,
                    "date": txn.date,
                    "account_id": txn.account_id,
                    "payee": txn.payee,
                    "description": txn.description,
                    "amount": txn.amount,
                    "currency": txn.currency,
                    "category": current_category_name(session, txn.id, categories),
                    "payload": payload,
                }
            )
        return {
            "transaction_ids": all_txn_ids,
            "transfer_like_rows": transfer_like_rows,
            "counts": {
                "transactions": session.execute(text("SELECT COUNT(*) FROM transactions")).scalar_one(),
                "splits": session.execute(text("SELECT COUNT(*) FROM transaction_split")).scalar_one(),
                "profiles": session.execute(text("SELECT COUNT(*) FROM merchant_profile")).scalar_one(),
                "memory": session.execute(text("SELECT COUNT(*) FROM transaction_memory")).scalar_one(),
                "audits": session.execute(text("SELECT COUNT(*) FROM classification_audit")).scalar_one(),
            },
        }


def reset_classification_state() -> None:
    with session_scope() as session:
        session.execute(text("DELETE FROM transaction_memory_fts"))
        session.execute(text("DELETE FROM transaction_memory"))
        session.execute(text("DELETE FROM merchant_profile"))
        session.execute(text("DELETE FROM classification_audit"))
        session.execute(text("DELETE FROM transaction_split"))
        session.execute(
            text(
                """
                UPDATE transactions
                SET classification = 'Personal',
                    reconciliation_state = CASE
                        WHEN reconciliation_state = 'pending' THEN 'pending'
                        ELSE 'imported'
                    END,
                    updated_at = :now
                """
            ),
            {"now": now_str()},
        )


def rebuild(transaction_ids: list[int]) -> dict[str, Any]:
    source_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    flow_counts: Counter[str] = Counter()
    errors: list[dict[str, Any]] = []

    total = len(transaction_ids)
    for idx, txn_id in enumerate(transaction_ids, start=1):
        try:
            with session_scope() as session:
                txn = session.execute(select(Transaction).where(Transaction.id == txn_id)).scalar_one_or_none()
                if not txn or is_legacy_opening_transaction(txn.description, txn.notes, txn.payee):
                    continue
                payload = build_transaction_payload(session, txn)
                result = classify_payload(session, payload)
                apply_classification(session, txn.id, result)
                if result.get("category_id"):
                    txn.reconciliation_state = "verified"
                elif txn.reconciliation_state != "pending":
                    txn.reconciliation_state = "imported"
                txn.updated_at = now_str()
                source_counts[result.get("source") or "unknown"] += 1
                category_counts[result.get("category_name") or "Uncategorized"] += 1
                flow_type = result.get("flow_type")
                if flow_type:
                    flow_counts[flow_type] += 1
        except Exception as exc:
            errors.append({"transaction_id": txn_id, "error": str(exc)})
        if idx % 250 == 0 or idx == total:
            print(f"Processed {idx}/{total} transactions")
    return {
        "source_counts": source_counts,
        "category_counts": category_counts,
        "flow_counts": flow_counts,
        "errors": errors,
    }


def snapshot_after(transfer_like_rows: list[dict[str, Any]]) -> dict[str, Any]:
    with session_scope() as session:
        categories = category_map(session)
        transfer_after: list[dict[str, Any]] = []
        for row in transfer_like_rows:
            txn = session.execute(select(Transaction).where(Transaction.id == row["id"])).scalar_one_or_none()
            if not txn:
                continue
            audit = session.execute(
                select(ClassificationAudit)
                .where(ClassificationAudit.transaction_id == txn.id)
                .order_by(ClassificationAudit.created_at.desc())
            ).scalars().first()
            transfer_after.append(
                {
                    **row,
                    "after_category": current_category_name(session, txn.id, categories),
                    "after_source": audit.source if audit else None,
                    "after_note": audit.note if audit else None,
                }
            )
        counts = {
            "transactions": session.execute(text("SELECT COUNT(*) FROM transactions")).scalar_one(),
            "splits": session.execute(text("SELECT COUNT(*) FROM transaction_split")).scalar_one(),
            "profiles": session.execute(text("SELECT COUNT(*) FROM merchant_profile")).scalar_one(),
            "memory": session.execute(text("SELECT COUNT(*) FROM transaction_memory")).scalar_one(),
            "audits": session.execute(text("SELECT COUNT(*) FROM classification_audit")).scalar_one(),
        }
        return {"transfer_like_rows": transfer_after, "counts": counts}


def summarize_changes(before_rows: list[dict[str, Any]], after_rows: list[dict[str, Any]]) -> dict[str, Any]:
    before_counter = Counter((row.get("category") or "Uncategorized") for row in before_rows)
    after_counter = Counter((row.get("after_category") or "Uncategorized") for row in after_rows)
    changed = [
        row
        for row in after_rows
        if (row.get("category") or "Uncategorized") != (row.get("after_category") or "Uncategorized")
    ]
    changed.sort(key=lambda row: (row["date"], abs(float(row["amount"] or 0.0))), reverse=True)
    return {
        "before_transfer_like_categories": before_counter,
        "after_transfer_like_categories": after_counter,
        "changed_samples": changed[:25],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild merchant profiles and reclassify transactions.")
    parser.add_argument("--report-json", action="store_true", help="Print full JSON report at the end.")
    args = parser.parse_args()

    init_db()
    backup_path = create_backup()
    print(f"Backup created: {backup_path}")

    before = snapshot_before()
    print(
        "Before rebuild:",
        json.dumps(
            {
                "counts": before["counts"],
                "transfer_like_transactions": len(before["transfer_like_rows"]),
            },
            ensure_ascii=True,
        ),
    )

    reset_classification_state()
    rebuild_stats = rebuild(before["transaction_ids"])
    after = snapshot_after(before["transfer_like_rows"])
    changes = summarize_changes(before["transfer_like_rows"], after["transfer_like_rows"])

    report = {
        "backup_path": str(backup_path),
        "before_counts": before["counts"],
        "after_counts": after["counts"],
        "transfer_like_transactions": len(before["transfer_like_rows"]),
        "rebuild_sources": dict(rebuild_stats["source_counts"].most_common()),
        "rebuild_categories_top20": dict(rebuild_stats["category_counts"].most_common(20)),
        "rebuild_flow_types": dict(rebuild_stats["flow_counts"].most_common()),
        "transfer_like_before": dict(changes["before_transfer_like_categories"].most_common()),
        "transfer_like_after": dict(changes["after_transfer_like_categories"].most_common()),
        "changed_transfer_like_samples": changes["changed_samples"],
        "errors": rebuild_stats["errors"][:50],
        "error_count": len(rebuild_stats["errors"]),
    }

    if args.report_json:
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return

    print("After rebuild:", json.dumps({"counts": after["counts"]}, ensure_ascii=True))
    print("Rebuild sources:", json.dumps(report["rebuild_sources"], ensure_ascii=True))
    print("Rebuild flow types:", json.dumps(report["rebuild_flow_types"], ensure_ascii=True))
    print("Transfer-like before:", json.dumps(report["transfer_like_before"], ensure_ascii=True))
    print("Transfer-like after:", json.dumps(report["transfer_like_after"], ensure_ascii=True))
    print("Changed transfer-like samples:", json.dumps(report["changed_transfer_like_samples"][:10], ensure_ascii=True))
    print("Errors:", json.dumps({"count": report["error_count"], "samples": report["errors"][:10]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
