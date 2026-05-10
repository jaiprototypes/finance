from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any


import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import UP_API_KEY
from ..models import Account, Transaction, TransactionSplit, UpAccount, UpTransaction
from .classification import classify_transaction_record, sync_full_amount_split
from .reconciliation import feed_reconciliation_state

logger = logging.getLogger(__name__)

UP_BASE_URL = "https://api.up.com.au/api/v1"

ACCOUNT_TYPE_MAP = {
    "TRANSACTIONAL": "bank",
    "SAVER": "savings",
    "HOME_LOAN": "loan",
}


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def is_configured() -> bool:
    return bool(UP_API_KEY)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {UP_API_KEY}",
        "Accept": "application/json",
    }


def _get(path: str, params: dict | None = None) -> dict:
    if not is_configured():
        raise ValueError("Up Bank is not configured")
    res = requests.get(f"{UP_BASE_URL}{path}", headers=_headers(), params=params, timeout=20)
    if not res.ok:
        try:
            data = res.json()
        except Exception:
            data = {"errors": [{"detail": res.text}]}
        message = data.get("errors", [{}])[0].get("detail") or res.text
        raise ValueError(f"Up Bank error: {message}")
    return res.json()


def _get_url(url: str) -> dict:
    if not is_configured():
        raise ValueError("Up Bank is not configured")
    res = requests.get(url, headers=_headers(), timeout=20)
    if not res.ok:
        try:
            data = res.json()
        except Exception:
            data = {"errors": [{"detail": res.text}]}
        message = data.get("errors", [{}])[0].get("detail") or res.text
        raise ValueError(f"Up Bank error: {message}")
    return res.json()


def _get_categories_map() -> dict[str, str]:
    data = _get("/categories")
    category_map: dict[str, str] = {}
    while True:
        for entry in data.get("data", []):
            cat_id = entry.get("id")
            attrs = entry.get("attributes") or {}
            name = attrs.get("name") or attrs.get("displayName")
            if cat_id and name:
                category_map[cat_id] = name
        next_url = (data.get("links") or {}).get("next")
        if not next_url:
            break
        data = _get_url(next_url)
    return category_map


def _parse_up_balance(attrs: dict[str, Any]) -> tuple[float | None, float | None, str | None]:
    balance = attrs.get("balance") or {}
    value = balance.get("value")
    amount: float | None = None
    if value is not None:
        try:
            amount = float(value)
        except Exception:
            amount = None
    if amount is None:
        try:
            amount = float(balance.get("valueInBaseUnits", 0)) / 100.0
        except Exception:
            amount = None
    return amount, amount, balance.get("currencyCode")


def refresh_account_balances(session: Session) -> dict:
    data = _get("/accounts")
    accounts = data.get("data", [])
    now = _now_str()
    updated = 0
    for entry in accounts:
        up_id = entry.get("id")
        attrs = entry.get("attributes") or {}
        if not up_id:
            continue
        current_balance, available_balance, balance_currency = _parse_up_balance(attrs)
        mapping = session.execute(
            select(UpAccount).where(UpAccount.up_account_id == up_id)
        ).scalar_one_or_none()
        if not mapping:
            continue
        mapping.currency = balance_currency or mapping.currency
        mapping.current_balance = current_balance
        mapping.available_balance = available_balance
        mapping.balance_as_of = now
        mapping.updated_at = now
        updated += 1
    return {"accounts": len(accounts), "updated": updated}


def sync_accounts(session: Session) -> dict:
    data = _get("/accounts")
    accounts = data.get("data", [])
    now = _now_str()
    created = 0
    updated = 0
    for entry in accounts:
        up_id = entry.get("id")
        attrs = entry.get("attributes") or {}
        if not up_id:
            continue
        name = attrs.get("displayName") or attrs.get("accountName") or "Up Account"
        account_type = attrs.get("accountType")
        ownership_type = attrs.get("ownershipType")
        current_balance, available_balance, balance_currency = _parse_up_balance(attrs)
        currency = balance_currency or "AUD"

        mapping = session.execute(
            select(UpAccount).where(UpAccount.up_account_id == up_id)
        ).scalar_one_or_none()

        if mapping and mapping.account_id:
            mapping.name = name
            mapping.account_type = account_type
            mapping.ownership_type = ownership_type
            mapping.currency = currency
            mapping.current_balance = current_balance
            mapping.available_balance = available_balance
            mapping.balance_as_of = now
            mapping.updated_at = now
            updated += 1
            continue

        local_account = Account(
            name=name,
            type=ACCOUNT_TYPE_MAP.get(account_type or "", "bank"),
            currency=currency,
            institution="Up Bank",
            note=f"Up account {up_id}",
            is_active=1,
            created_at=now,
            updated_at=now,
        )
        session.add(local_account)
        session.flush()

        mapping = UpAccount(
            up_account_id=up_id,
            account_id=local_account.id,
            name=name,
            account_type=account_type,
            ownership_type=ownership_type,
            currency=currency,
            current_balance=current_balance,
            available_balance=available_balance,
            balance_as_of=now,
            is_active=1,
            last_synced_at=None,
            created_at=now,
            updated_at=now,
        )
        session.add(mapping)
        created += 1

    return {"accounts": len(accounts), "created": created, "updated": updated}


def sync_transactions(session: Session, full: bool = False) -> dict:
    accounts = session.execute(select(UpAccount)).scalars().all()
    if not accounts:
        return {"accounts": 0, "added": 0, "updated": 0}
    balance_result = refresh_account_balances(session)
    try:
        category_map = _get_categories_map()
    except Exception:
        logger.warning("Failed to fetch Up categories for enrichment.", exc_info=True)
        category_map = {}
    totals = {"accounts": len(accounts), "added": 0, "updated": 0, "balances_updated": balance_result["updated"]}
    for account in accounts:
        if not account.up_account_id or not account.account_id:
            continue
        since = None if full else account.last_synced_at
        added, updated, last_seen = _sync_account_transactions(
            session, account.account_id, account.up_account_id, since, category_map
        )
        totals["added"] += added
        totals["updated"] += updated
        if last_seen:
            account.last_synced_at = last_seen
        account.updated_at = _now_str()
    return totals


def _sync_account_transactions(
    session: Session, local_account_id: int, up_account_id: str, since: str | None, category_map: dict[str, str]
) -> tuple[int, int, str | None]:
    added = 0
    updated = 0
    last_seen = since
    params: dict[str, Any] = {"page[size]": 100}
    if since:
        params["filter[since]"] = since

    next_url: str | None = None
    now = _now_str()

    while True:
        payload = _get_url(next_url) if next_url else _get(f"/accounts/{up_account_id}/transactions", params=params)
        rows = payload.get("data", [])
        for txn in rows:
            txn_id = txn.get("id")
            attrs = txn.get("attributes") or {}
            if not txn_id:
                continue
            relationships = txn.get("relationships") or {}
            category_rel = (relationships.get("category") or {}).get("data") or {}
            up_category_id = category_rel.get("id")
            up_category_name = category_map.get(up_category_id) if up_category_id else None
            amount_obj = attrs.get("amount") or {}
            amount_value = amount_obj.get("value")
            try:
                amount = float(amount_value)
            except Exception:
                amount = float(amount_obj.get("valueInBaseUnits", 0)) / 100.0
            currency = amount_obj.get("currencyCode") or "AUD"
            description = attrs.get("description") or "Up transaction"
            message = attrs.get("message") or ""
            status = attrs.get("status") or ""
            created_at = attrs.get("createdAt") or attrs.get("settledAt") or now
            payee = attrs.get("rawText") or None
            reconciliation_state = "pending" if status.lower() == "held" else "imported"

            if not last_seen or created_at > last_seen:
                last_seen = created_at

            mapping = session.execute(
                select(UpTransaction).where(UpTransaction.up_transaction_id == txn_id)
            ).scalar_one_or_none()
            if mapping and mapping.transaction_id:
                existing = session.execute(
                    select(Transaction).where(Transaction.id == mapping.transaction_id)
                ).scalar_one_or_none()
                if existing:
                    previous_amount = float(existing.amount or 0.0)
                    has_split = (
                        session.execute(
                            select(TransactionSplit.id).where(TransactionSplit.transaction_id == existing.id).limit(1)
                        ).scalar_one_or_none()
                        is not None
                    )
                    existing.date = created_at[:10]
                    existing.amount = amount
                    existing.currency = currency
                    existing.description = description
                    existing.payee = payee or existing.payee
                    existing.notes = message or existing.notes
                    existing.reconciliation_state = feed_reconciliation_state(
                        existing.reconciliation_state,
                        feed_pending=status.lower() == "held",
                        has_split=has_split,
                    )
                    existing.updated_at = now
                    sync_full_amount_split(session, existing.id, previous_amount, amount, currency)
                mapping.status = status
                mapping.up_category_id = up_category_id
                mapping.up_category_name = up_category_name
                mapping.updated_at = now
                if existing:
                    try:
                        classify_transaction_record(
                            session,
                            existing.id,
                            extra_payload={"bank_category": up_category_name or up_category_id},
                        )
                    except Exception:
                        logger.warning("Auto-classification failed for Up transaction %s", existing.id, exc_info=True)
                updated += 1
                continue

            transaction = Transaction(
                account_id=local_account_id,
                date=created_at[:10],
                description=description,
                amount=amount,
                currency=currency,
                payee=payee,
                notes=message or f"Up transaction {txn_id}",
                classification="Personal",
                reconciliation_state=reconciliation_state,
                import_batch_id=None,
                created_at=now,
                updated_at=now,
            )
            session.add(transaction)
            session.flush()

            mapping = UpTransaction(
                up_transaction_id=txn_id,
                account_id=local_account_id,
                transaction_id=transaction.id,
                status=status,
                up_category_id=up_category_id,
                up_category_name=up_category_name,
                created_at=now,
                updated_at=now,
            )
            session.add(mapping)
            try:
                classify_transaction_record(
                    session,
                    transaction.id,
                    extra_payload={"bank_category": up_category_name or up_category_id},
                )
            except Exception:
                logger.warning("Auto-classification failed for Up transaction %s", transaction.id, exc_info=True)
            added += 1

        next_url = (payload.get("links") or {}).get("next")
        if not next_url:
            break

    return added, updated, last_seen
