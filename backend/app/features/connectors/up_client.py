from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any


import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...config import UP_API_KEY
from ...core.classification_port import classify_transaction_record, sync_full_amount_split
from ..ledger.ingestion import LedgerIngestionService
from .models import UpAccount, UpTransaction
from ..ledger.models import Account, Transaction, TransactionSplit
from ..ledger.reconciliation import feed_reconciliation_state
from .up_cash import UpCashMetadata
from .up_accounts import UpAccountLifecycle

logger = logging.getLogger(__name__)
ledger_ingestion = LedgerIngestionService()

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
    """Refresh the complete account inventory before reading current balances."""
    result = sync_accounts(session)
    return {"accounts": result["accounts"], "updated": result["created"] + result["updated"]}


def _account_snapshot() -> list[dict]:
    """Read every page before interpreting a missing account as closed."""
    data = _get("/accounts")
    accounts = list(data["data"])
    while data.get("links", {}).get("next"):
        data = _get_url(data["links"]["next"])
        accounts.extend(data["data"])
    if any(not entry.get("id") for entry in accounts):
        raise ValueError("Up returned an account without an ID")
    return accounts


def sync_accounts(session: Session) -> dict:
    accounts = _account_snapshot()
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

    session.flush()
    archived = UpAccountLifecycle.reconcile(
        session, {entry["id"] for entry in accounts}, observed_at=now,
    )
    session.flush()
    return {"accounts": len(accounts), "created": created, "updated": updated, "archived": archived}


def sync_transactions(session: Session, full: bool = False) -> dict:
    balance_result = refresh_account_balances(session)
    accounts = session.scalars(select(UpAccount).where(UpAccount.is_active == 1)).all()
    if not accounts:
        return {"accounts": 0, "added": 0, "updated": 0}
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


def _owned_transfer_account_id(session: Session, account_id: int, currency: str, relationships: dict) -> int | None:
    """Trust provider account links only when both known accounts share a currency."""
    remote = ((relationships.get("transferAccount") or {}).get("data") or {}).get("id")
    if not remote:
        return None
    target = session.execute(select(UpAccount).where(UpAccount.up_account_id == remote)).scalar_one_or_none()
    if not target or not target.account_id or target.account_id == account_id:
        return None
    account = session.get(Account, target.account_id)
    return account.id if account and account.currency == currency else None


def _classify_unassigned_up_transaction(session: Session, transaction: Transaction, payload: dict) -> None:
    """Preserve existing manual allocations when refreshing provider metadata."""
    if session.scalar(select(TransactionSplit.id).where(TransactionSplit.transaction_id == transaction.id).limit(1)):
        return
    try:
        classify_transaction_record(session, transaction.id, extra_payload=payload)
    except Exception:
        logger.warning("Auto-classification failed for Up transaction %s", transaction.id, exc_info=True)


def _update_up_transaction(session: Session, transaction: Transaction, attributes: dict, now: str, payload: dict) -> None:
    """Refresh the bank purchase independently of embedded savings and cashback."""
    previous_amount = float(transaction.amount or 0.0)
    amount = UpCashMetadata.amount(attributes.get("amount"))
    currency = (attributes.get("amount") or {}).get("currencyCode") or "AUD"
    has_split = session.scalar(select(TransactionSplit.id).where(TransactionSplit.transaction_id == transaction.id).limit(1)) is not None
    transaction.date = (attributes.get("createdAt") or attributes.get("settledAt") or now)[:10]
    transaction.amount = amount
    transaction.currency = currency
    transaction.description = attributes.get("description") or "Up transaction"
    transaction.payee = attributes.get("rawText") or transaction.payee
    transaction.notes = attributes.get("message") or transaction.notes
    transaction.reconciliation_state = feed_reconciliation_state(
        transaction.reconciliation_state, feed_pending=False, has_split=has_split)
    transaction.updated_at = now
    sync_full_amount_split(session, transaction.id, previous_amount, amount, currency)
    _classify_unassigned_up_transaction(session, transaction, payload)


def sync_transaction_record(
    session: Session, local_account_id: int, record: dict,
    category_map: dict[str, str] | None = None, *, now: str | None = None,
) -> bool:
    """Upsert one complete provider record; return whether a ledger row was added."""
    now = now or _now_str()
    provider_id = record["id"]
    attributes = record.get("attributes") or {}
    relationships = record.get("relationships") or {}
    category_id = ((relationships.get("category") or {}).get("data") or {}).get("id")
    category_name = (category_map or {}).get(category_id) if category_id else None
    currency = (attributes.get("amount") or {}).get("currencyCode") or "AUD"
    payload = {"bank_category": category_name or category_id, "owned_transfer_account_id":
               _owned_transfer_account_id(session, local_account_id, currency, relationships)}
    mapping = session.scalar(select(UpTransaction).where(UpTransaction.up_transaction_id == provider_id))
    transaction = session.get(Transaction, mapping.transaction_id) if mapping and mapping.transaction_id else None
    added = transaction is None
    if transaction:
        _update_up_transaction(session, transaction, attributes, now, payload)
    else:
        transaction, _, error = ledger_ingestion.create_transaction(
            session, account_id=local_account_id,
            date=(attributes.get("createdAt") or attributes.get("settledAt") or now)[:10],
            description=attributes.get("description") or "Up transaction",
            amount=UpCashMetadata.amount(attributes.get("amount")), currency=currency,
            payee=attributes.get("rawText") or None,
            notes=attributes.get("message") or f"Up transaction {provider_id}",
            classification="Personal", reconciliation_state="imported",
            auto_classify=True, classification_payload=payload,
        )
        if error:
            logger.warning("Auto-classification failed for Up transaction %s: %s", transaction.id, error)
    if not mapping:
        mapping = UpTransaction(up_transaction_id=provider_id, account_id=local_account_id, created_at=now)
        session.add(mapping)
    mapping.transaction_id = transaction.id
    mapping.up_category_id = category_id
    mapping.up_category_name = category_name
    mapping.updated_at = now
    UpCashMetadata.apply(mapping, attributes, relationships, synced_at=now)
    # A reviewed category does not settle a card authorization at the bank.
    if mapping.status.lower() == "held":
        transaction.reconciliation_state = "pending"
    session.flush()
    return added


def _refresh_held_transactions(session: Session, account_id: int, seen_ids: set[str], category_map: dict, now: str) -> int:
    """Revisit old authorizations whose settlement is outside the creation cursor."""
    rows = session.scalars(select(UpTransaction).where(
        UpTransaction.account_id == account_id, UpTransaction.status.in_(["HELD", "held"]))).all()
    updated = 0
    for mapping in rows:
        if mapping.up_transaction_id in seen_ids:
            continue
        try:
            record = _get(f"/transactions/{mapping.up_transaction_id}").get("data")
            if record and record.get("id"):
                sync_transaction_record(session, account_id, record, category_map, now=now)
                updated += 1
        except ValueError:
            logger.warning("Could not refresh Up authorization %s", mapping.transaction_id, exc_info=True)
    return updated


def _sync_account_transactions(
    session: Session, local_account_id: int, up_account_id: str, since: str | None, category_map: dict[str, str]
) -> tuple[int, int, str | None]:
    """Import new records, then refresh unsettled records older than the cursor."""
    added = updated = 0
    last_seen, next_url, now = since, None, _now_str()
    seen_ids: set[str] = set()
    params: dict[str, Any] = {"page[size]": 100}
    if since:
        params["filter[since]"] = since
    while True:
        payload = _get_url(next_url) if next_url else _get(f"/accounts/{up_account_id}/transactions", params=params)
        for record in payload.get("data", []):
            if not record.get("id"):
                continue
            created_at = (record.get("attributes") or {}).get("createdAt") or now
            if not last_seen or created_at > last_seen:
                last_seen = created_at
            is_new = sync_transaction_record(session, local_account_id, record, category_map, now=now)
            seen_ids.add(record["id"])
            added += int(is_new)
            updated += int(not is_new)
        next_url = (payload.get("links") or {}).get("next")
        if not next_url:
            break
    updated += _refresh_held_transactions(session, local_account_id, seen_ids, category_map, now)
    return added, updated, last_seen
