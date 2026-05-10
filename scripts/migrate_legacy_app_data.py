#!/usr/bin/env python3
import argparse
import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def today_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")


def default_target_db() -> Path:
    env_dir = os.getenv("APP_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser() / "finance.db"
    return Path.home() / "Library" / "Application Support" / "Finances" / "finance.db"


def apply_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
        """
    )
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations").fetchall()}
    for path in sorted(migrations_dir.glob("*.sql")):
        version = path.stem
        if version in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        for stmt in statements:
            conn.execute(stmt)
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)",
            (version, now_iso()),
        )
    conn.commit()


def account_type_for_loan(kind: str) -> str:
    kind = (kind or "").lower()
    if kind in {"student_private", "student_federal"}:
        return "student loan"
    if kind == "credit_card":
        return "credit card"
    return "loan"


def get_or_create_account(
    conn: sqlite3.Connection,
    name: str,
    acc_type: str,
    currency: str,
    note: str,
    institution: str | None = None,
) -> int:
    row = conn.execute(
        "SELECT id FROM account WHERE name=? AND type=? AND currency=?",
        (name, acc_type, currency),
    ).fetchone()
    if row:
        return int(row[0])
    now = now_iso()
    cur = conn.execute(
        """
        INSERT INTO account(name, type, currency, institution, note, is_active, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?)
        """,
        (name, acc_type, currency, institution, note, 1, now, now),
    )
    return int(cur.lastrowid)


def create_transaction(
    conn: sqlite3.Connection,
    account_id: int,
    date: str,
    description: str,
    amount: float,
    currency: str,
    notes: str,
    import_batch_id: int,
) -> int:
    now = now_iso()
    cur = conn.execute(
        """
        INSERT INTO transactions(
          account_id, date, description, amount, currency, payee, notes,
          classification, reconciliation_state, import_batch_id, created_at, updated_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            account_id,
            date,
            description,
            amount,
            currency,
            None,
            notes,
            "Personal",
            "imported",
            import_batch_id,
            now,
            now,
        ),
    )
    return int(cur.lastrowid)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate legacy app_data.db into Finances.")
    parser.add_argument(
        "--legacy-db",
        default="legacy/streamlit_debt_planner/app_data.db",
        help="Path to legacy app_data.db",
    )
    parser.add_argument(
        "--target-db",
        default=str(default_target_db()),
        help="Path to target finance.db (default: app data dir)",
    )
    parser.add_argument("--force", action="store_true", help="Run even if already imported")
    args = parser.parse_args()

    legacy_path = Path(args.legacy_db).expanduser()
    if not legacy_path.exists():
        raise SystemExit(f"Legacy DB not found: {legacy_path}")

    target_path = Path(args.target_db).expanduser()
    target_path.parent.mkdir(parents=True, exist_ok=True)

    migrations_dir = Path(__file__).resolve().parent.parent / "backend" / "app" / "migrations" / "sql"

    with sqlite3.connect(target_path) as target_conn:
        target_conn.row_factory = sqlite3.Row
        apply_migrations(target_conn, migrations_dir)

        existing = target_conn.execute(
            "SELECT value FROM app_setting WHERE key=?",
            ("legacy_app_data_db_imported",),
        ).fetchone()
        if existing and not args.force:
            print("Legacy import already completed. Use --force to re-run.")
            return 0

        with sqlite3.connect(legacy_path) as legacy_conn:
            legacy_conn.row_factory = sqlite3.Row
            loans = legacy_conn.execute("SELECT * FROM loans").fetchall()
            payments = legacy_conn.execute("SELECT * FROM payments").fetchall()
            deposits = legacy_conn.execute("SELECT * FROM deposits").fetchall()
            balances = legacy_conn.execute("SELECT * FROM balances").fetchall()
            fx_rows = legacy_conn.execute("SELECT date, aud_per_usd FROM fx").fetchall()

        now = now_iso()
        batch_cur = target_conn.execute(
            """
            INSERT INTO import_batch(source, file_name, created_at, status, total_rows, imported_rows, duplicate_rows)
            VALUES(?,?,?,?,?,?,?)
            """,
            ("legacy_app_data_db", legacy_path.name, now, "imported", 0, 0, 0),
        )
        import_batch_id = int(batch_cur.lastrowid)

        payment_map: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for payment in payments:
            payment_map[int(payment["loan_id"])].append(payment)

        loan_account_ids: dict[int, int] = {}
        created_tx = 0
        created_links = 0
        created_profiles = 0

        for loan in loans:
            legacy_id = int(loan["id"])
            currency = loan["currency"]
            name = loan["name"]
            apr = float(loan["apr"] or 0.0)
            principal = float(loan["principal"] or 0.0)
            accrued_interest = float(loan["accrued_interest"] or 0.0)
            total_balance = principal + accrued_interest
            kind = loan["kind"]
            secured = int(loan["secured"] or 0)
            last_accrual = loan["last_accrual"] or ""
            created_at = loan["created_at"] or ""

            note_parts = [
                f"Legacy loan id: {legacy_id}",
                f"kind: {kind}",
                f"secured: {secured}",
                f"accrued_interest: {accrued_interest}",
            ]
            if last_accrual:
                note_parts.append(f"last_accrual: {last_accrual}")
            if created_at:
                note_parts.append(f"created_at: {created_at}")
            note = " | ".join(note_parts)

            acc_type = account_type_for_loan(kind)
            account_id = get_or_create_account(
                target_conn,
                name=name,
                acc_type=acc_type,
                currency=currency,
                note=note,
            )
            loan_account_ids[legacy_id] = account_id

            existing_profile = target_conn.execute(
                "SELECT id FROM debt_profile WHERE account_id=?",
                (account_id,),
            ).fetchone()
            if not existing_profile:
                target_conn.execute(
                    """
                    INSERT INTO debt_profile(account_id, apr, min_payment, due_date, compounding, created_at)
                    VALUES(?,?,?,?,?,?)
                    """,
                    (account_id, apr, 0.0, None, "daily", now),
                )
                created_profiles += 1

            loan_payments = payment_map.get(legacy_id, [])
            total_payments = sum(float(p["amount"] or 0.0) for p in loan_payments)
            opening_amount = -(total_balance + total_payments)
            opening_date = created_at or last_accrual or today_str()
            if abs(opening_amount) > 0.0001:
                create_transaction(
                    target_conn,
                    account_id=account_id,
                    date=opening_date,
                    description="Legacy Opening Balance",
                    amount=opening_amount,
                    currency=currency,
                    notes=f"Imported opening for legacy loan {legacy_id}",
                    import_batch_id=import_batch_id,
                )
                created_tx += 1

            for payment in loan_payments:
                pay_amount = float(payment["amount"] or 0.0)
                if abs(pay_amount) <= 0.0001:
                    continue
                pay_date = payment["date"] or today_str()
                pay_currency = payment["currency"] or currency
                note_parts = []
                if payment["note"]:
                    note_parts.append(str(payment["note"]))
                if "interest_paid" in payment.keys() and payment["interest_paid"] is not None:
                    note_parts.append(f"interest_paid: {payment['interest_paid']}")
                if "principal_paid" in payment.keys() and payment["principal_paid"] is not None:
                    note_parts.append(f"principal_paid: {payment['principal_paid']}")
                pay_note = " | ".join(note_parts) if note_parts else "Legacy payment import"
                tx_id = create_transaction(
                    target_conn,
                    account_id=account_id,
                    date=pay_date,
                    description="Legacy Payment",
                    amount=pay_amount,
                    currency=pay_currency,
                    notes=pay_note,
                    import_batch_id=import_batch_id,
                )
                created_tx += 1
                target_conn.execute(
                    "INSERT INTO debt_payment_link(transaction_id, account_id, amount) VALUES(?,?,?)",
                    (tx_id, account_id, pay_amount),
                )
                created_links += 1

        cash_accounts: dict[str, int] = {}
        currencies = {row["currency"] for row in balances} | {row["currency"] for row in deposits}
        for currency in sorted(currencies):
            existing_cash = target_conn.execute(
                "SELECT id FROM account WHERE type=? AND currency=? ORDER BY id",
                ("cash", currency),
            ).fetchone()
            if existing_cash:
                cash_accounts[currency] = int(existing_cash[0])
            else:
                cash_accounts[currency] = get_or_create_account(
                    target_conn,
                    name=f"Cash ({currency})",
                    acc_type="cash",
                    currency=currency,
                    note="Imported from legacy balances/deposits",
                )

        deposit_totals: dict[str, float] = defaultdict(float)
        latest_deposit_date: dict[str, str] = {}
        for dep in deposits:
            amount = float(dep["amount"] or 0.0)
            currency = dep["currency"]
            dep_date = dep["date"] or today_str()
            deposit_totals[currency] += amount
            latest_deposit_date[currency] = max(latest_deposit_date.get(currency, ""), dep_date)
            if abs(amount) <= 0.0001:
                continue
            tx_id = create_transaction(
                target_conn,
                account_id=cash_accounts[currency],
                date=dep_date,
                description="Legacy Deposit",
                amount=amount,
                currency=currency,
                notes=dep["note"] or "Legacy deposit import",
                import_batch_id=import_batch_id,
            )
            created_tx += 1

        for bal in balances:
            currency = bal["currency"]
            balance_amount = float(bal["amount"] or 0.0)
            deposits_sum = deposit_totals.get(currency, 0.0)
            diff = balance_amount - deposits_sum
            if abs(diff) <= 0.0001:
                continue
            adj_date = latest_deposit_date.get(currency) or today_str()
            create_transaction(
                target_conn,
                account_id=cash_accounts[currency],
                date=adj_date,
                description="Legacy Balance Adjustment",
                amount=diff,
                currency=currency,
                notes="Adjusted to legacy balance snapshot",
                import_batch_id=import_batch_id,
            )
            created_tx += 1

        existing_fx = {
            row["date"] for row in target_conn.execute("SELECT date FROM fx_rate").fetchall()
        }
        created_fx = 0
        for row in fx_rows:
            date = row["date"]
            if date in existing_fx:
                continue
            target_conn.execute(
                "INSERT INTO fx_rate(date, aud_per_usd, source, created_at) VALUES(?,?,?,?)",
                (date, float(row["aud_per_usd"]), "legacy", now),
            )
            created_fx += 1

        target_conn.execute(
            "UPDATE import_batch SET total_rows=?, imported_rows=? WHERE id=?",
            (created_tx, created_tx, import_batch_id),
        )
        summary = {
            "source": str(legacy_path),
            "imported_at": now,
            "batch_id": import_batch_id,
            "accounts": len(loan_account_ids) + len(cash_accounts),
            "transactions": created_tx,
            "debt_profiles": created_profiles,
            "debt_payment_links": created_links,
            "fx_rates": created_fx,
        }
        target_conn.execute(
            "INSERT OR REPLACE INTO app_setting(key, value) VALUES(?, ?)",
            ("legacy_app_data_db_imported", json.dumps(summary, ensure_ascii=True)),
        )

        target_conn.commit()

    print("Legacy migration complete.")
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
