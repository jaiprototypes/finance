import csv
import io
import json
from typing import Any

from sqlalchemy import select

from shared.imports import fingerprint
from ..ledger.ingestion import LedgerIngestionService
from .models import ImportBatch, ImportRow
from ..ledger.models import Transaction

ledger_ingestion = LedgerIngestionService()


def create_import_batch(session, source: str | None, file_name: str | None) -> ImportBatch:
    batch = ImportBatch(
        source=source,
        file_name=file_name,
        created_at=_now_str(),
        status="imported",
        total_rows=0,
        imported_rows=0,
        duplicate_rows=0,
    )
    session.add(batch)
    session.flush()
    return batch


def preview_csv(contents: bytes, mapping: dict[str, str], max_rows: int = 20) -> dict:
    text = contents.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    errors = []
    for idx, row in enumerate(reader):
        if idx >= max_rows:
            break
        try:
            parsed = _map_row(row, mapping)
            rows.append(parsed)
        except ValueError as exc:
            errors.append({"row_index": idx, "error": str(exc)})
    return {"rows": rows, "errors": errors}


def import_csv(
    session,
    batch: ImportBatch,
    contents: bytes,
    mapping: dict[str, str],
    account_id: int,
    default_currency: str,
    classification: str = "Personal",
    auto_classify: bool = True,
) -> dict:
    text = contents.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    duplicates = 0
    total = 0

    for idx, row in enumerate(reader):
        total += 1
        try:
            parsed = _map_row(row, mapping)
            parsed["account_id"] = account_id
            parsed.setdefault("currency", default_currency)
            parsed.setdefault("classification", classification)
            fp = fingerprint(parsed)

            exists = session.execute(select(ImportRow).where(ImportRow.fingerprint == fp)).scalar_one_or_none()
            if exists:
                duplicates += 1
                import_row = ImportRow(
                    batch_id=batch.id,
                    row_index=idx,
                    raw_json=json.dumps(row, ensure_ascii=True),
                    parsed_json=json.dumps(parsed, ensure_ascii=True),
                    fingerprint=fp,
                    status="duplicate",
                )
                session.add(import_row)
                continue

            txn, _classification_result, classification_error = ledger_ingestion.create_transaction(
                session,
                account_id=account_id,
                date=parsed["date"],
                description=parsed["description"],
                amount=float(parsed["amount"]),
                currency=parsed.get("currency") or default_currency,
                payee=parsed.get("payee"),
                notes=parsed.get("notes"),
                classification=parsed.get("classification") or classification,
                reconciliation_state="imported",
                import_batch_id=batch.id,
                auto_classify=auto_classify,
            )
            parsed["transaction_id"] = txn.id

            import_row = ImportRow(
                batch_id=batch.id,
                row_index=idx,
                raw_json=json.dumps(row, ensure_ascii=True),
                parsed_json=json.dumps(parsed, ensure_ascii=True),
                fingerprint=fp,
                status="imported",
                transaction_id=txn.id,
                error=classification_error,
            )
            session.add(import_row)
            imported += 1
        except Exception as exc:
            import_row = ImportRow(
                batch_id=batch.id,
                row_index=idx,
                raw_json=json.dumps(row, ensure_ascii=True),
                parsed_json=None,
                fingerprint=fingerprint({"row_index": idx, "error": str(exc)}),
                status="error",
                error=str(exc),
            )
            session.add(import_row)

    batch.total_rows = total
    batch.imported_rows = imported
    batch.duplicate_rows = duplicates
    return {"total": total, "imported": imported, "duplicates": duplicates}


def rollback_batch(session, batch_id: int) -> dict:
    rows = session.execute(select(ImportRow).where(ImportRow.batch_id == batch_id)).scalars().all()
    txn_ids = [r.transaction_id for r in rows if r.transaction_id]
    if txn_ids:
        session.execute(Transaction.__table__.delete().where(Transaction.id.in_(txn_ids)))
    session.execute(ImportRow.__table__.delete().where(ImportRow.batch_id == batch_id))
    session.execute(ImportBatch.__table__.delete().where(ImportBatch.id == batch_id))
    return {"removed_transactions": len(txn_ids), "removed_rows": len(rows)}


def _map_row(row: dict[str, Any], mapping: dict[str, str]) -> dict:
    parsed = {}
    for target, source in mapping.items():
        if source not in row:
            raise ValueError(f"Missing column: {source}")
        parsed[target] = row[source].strip() if isinstance(row[source], str) else row[source]
    if "date" not in parsed or "description" not in parsed or "amount" not in parsed:
        raise ValueError("Mapping requires date, description, and amount")
    return parsed


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
