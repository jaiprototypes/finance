from __future__ import annotations

from collections import Counter, defaultdict
import logging
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...config import PLAID_CLIENT_ID, PLAID_ENV, PLAID_REDIRECT_URI, PLAID_SECRET
from ..ledger.ingestion import LedgerIngestionService
from ..classification.models import ClassificationAudit, TransactionMemory
from .models import PlaidAccount, PlaidItem, PlaidTransaction
from ..debts.models import DebtPaymentLink
from ..imports.models import ImportRow
from ..ledger.models import Account, Attachment, Transaction, TransactionSplit, TransactionTag
from ..receivables.models import InvoicePaymentLink
from ..classification.service import classify_transaction_record, sync_full_amount_split
from ..ledger.reconciliation import feed_reconciliation_state

logger = logging.getLogger(__name__)
ledger_ingestion = LedgerIngestionService()

PLAID_BASES = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


class PlaidRequestError(ValueError):
    def __init__(
        self,
        path: str,
        message: str,
        *,
        error_code: str | None = None,
        request_id: str | None = None,
    ):
        details = message
        if error_code:
            details = f"{details} ({error_code})"
        if request_id:
            details = f"{details} request_id={request_id}"
        super().__init__(f"Plaid {path} failed: {details}")
        self.path = path
        self.message = message
        self.error_code = error_code
        self.request_id = request_id


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _normalize_text(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _plaid_account_signature(
    institution_name: str | None,
    name: str | None,
    official_name: str | None,
    mask: str | None,
    currency: str | None,
    subtype: str | None,
    account_type: str | None,
) -> tuple[str, str, str, str, str, str, str]:
    return (
        _normalize_text(institution_name),
        _normalize_text(official_name or name),
        _normalize_text(name),
        (mask or "").strip(),
        (currency or "").strip().upper(),
        _normalize_text(subtype),
        _normalize_text(account_type),
    )


def _plaid_account_signature_from_payload(institution_name: str | None, account: dict[str, Any]) -> tuple[str, str, str, str, str, str, str]:
    return _plaid_account_signature(
        institution_name,
        account.get("name"),
        account.get("official_name"),
        account.get("mask"),
        account.get("balances", {}).get("iso_currency_code") or "USD",
        account.get("subtype"),
        account.get("type"),
    )


def _extract_plaid_balance_fields(account: dict[str, Any]) -> tuple[float | None, float | None, str]:
    balances = account.get("balances") or {}
    current = balances.get("current")
    available = balances.get("available")
    try:
        current_value = float(current) if current is not None else None
    except Exception:
        current_value = None
    try:
        available_value = float(available) if available is not None else None
    except Exception:
        available_value = None
    currency = balances.get("iso_currency_code") or "USD"
    return current_value, available_value, currency


def _plaid_account_signature_from_model(item_map: dict[str, PlaidItem], account: PlaidAccount) -> tuple[str, str, str, str, str, str, str]:
    item = item_map.get(account.item_id)
    return _plaid_account_signature(
        item.institution_name if item else None,
        account.name,
        account.official_name,
        account.mask,
        account.currency,
        account.subtype,
        account.type,
    )


def _find_matching_active_plaid_account(
    session: Session,
    institution_name: str | None,
    account: dict[str, Any],
    exclude_item_id: str | None = None,
) -> PlaidAccount | None:
    target = _plaid_account_signature_from_payload(institution_name, account)
    items = {
        item.item_id: item
        for item in session.execute(select(PlaidItem)).scalars().all()
    }
    candidates = session.execute(
        select(PlaidAccount).where(PlaidAccount.is_active == 1)
    ).scalars().all()
    matches = []
    for candidate in candidates:
        if exclude_item_id and candidate.item_id == exclude_item_id:
            continue
        if _plaid_account_signature_from_model(items, candidate) == target:
            matches.append(candidate)
    if not matches:
        return None
    return min(matches, key=lambda row: row.id)


def _is_supported_plaid_account(account: dict[str, Any]) -> bool:
    return account.get("type") == "depository" and account.get("subtype") == "checking"


def _sync_plaid_account_mappings(
    session: Session,
    item: PlaidItem,
    accounts: list[dict[str, Any]],
    institution_name: str | None,
    now: str,
) -> dict[str, Any]:
    account_map: dict[str, int | None] = {}
    active_accounts = 0
    duplicate_accounts = 0
    created_accounts = 0
    created_duplicate_accounts = 0
    updated_accounts = 0

    for account in accounts:
        if not _is_supported_plaid_account(account):
            continue
        plaid_account_id = account.get("account_id")
        if not plaid_account_id:
            continue
        current_balance, available_balance, currency = _extract_plaid_balance_fields(account)
        existing = session.execute(
            select(PlaidAccount).where(PlaidAccount.plaid_account_id == plaid_account_id)
        ).scalar_one_or_none()
        if existing:
            existing.name = account.get("name")
            existing.official_name = account.get("official_name")
            existing.type = account.get("type")
            existing.subtype = account.get("subtype")
            existing.mask = account.get("mask")
            existing.currency = currency or existing.currency
            existing.current_balance = current_balance
            existing.available_balance = available_balance
            existing.balance_as_of = now
            existing.updated_at = now
            account_map[plaid_account_id] = existing.account_id
            updated_accounts += 1
            if existing.is_active == 1:
                active_accounts += 1
            else:
                duplicate_accounts += 1
            continue

        matching_active = _find_matching_active_plaid_account(
            session,
            institution_name,
            account,
            exclude_item_id=item.item_id,
        )
        if matching_active and matching_active.account_id:
            plaid_account = PlaidAccount(
                item_id=item.item_id,
                plaid_account_id=plaid_account_id,
                account_id=matching_active.account_id,
                name=account.get("name"),
                official_name=account.get("official_name"),
                type=account.get("type"),
                subtype=account.get("subtype"),
                mask=account.get("mask"),
                currency=currency,
                current_balance=current_balance,
                available_balance=available_balance,
                balance_as_of=now,
                created_at=now,
                updated_at=now,
                is_active=0,
            )
            session.add(plaid_account)
            account_map[plaid_account_id] = matching_active.account_id
            duplicate_accounts += 1
            created_duplicate_accounts += 1
            continue

        local_account = Account(
            name=f"{institution_name or 'Plaid'} {account.get('name')}".strip(),
            type="bank",
            currency=currency,
            institution=institution_name or "Plaid",
            note=f"Plaid account {plaid_account_id}",
            is_active=1,
            created_at=now,
            updated_at=now,
        )
        session.add(local_account)
        session.flush()

        plaid_account = PlaidAccount(
            item_id=item.item_id,
            plaid_account_id=plaid_account_id,
            account_id=local_account.id,
            name=account.get("name"),
            official_name=account.get("official_name"),
            type=account.get("type"),
            subtype=account.get("subtype"),
            mask=account.get("mask"),
            currency=currency,
            current_balance=current_balance,
            available_balance=available_balance,
            balance_as_of=now,
            created_at=now,
            updated_at=now,
            is_active=1,
        )
        session.add(plaid_account)
        account_map[plaid_account_id] = local_account.id
        active_accounts += 1
        created_accounts += 1

    return {
        "accounts": account_map,
        "active_accounts": active_accounts,
        "duplicate_accounts": duplicate_accounts,
        "created_accounts": created_accounts,
        "created_duplicate_accounts": created_duplicate_accounts,
        "updated_accounts": updated_accounts,
    }


def _refresh_plaid_account_balances(session: Session, item: PlaidItem, now: str) -> dict[str, Any]:
    accounts_data = plaid_request("/accounts/get", {"access_token": item.access_token})
    accounts = accounts_data.get("accounts", [])
    return _sync_plaid_account_mappings(session, item, accounts, item.institution_name, now)


def _plaid_error_payload(item: PlaidItem, exc: PlaidRequestError) -> dict[str, Any]:
    return {
        "item_id": item.item_id,
        "institution_name": item.institution_name,
        "endpoint": exc.path,
        "message": exc.message,
        "error_code": exc.error_code,
        "request_id": exc.request_id,
    }


def _is_login_required_error(exc: PlaidRequestError) -> bool:
    return exc.error_code == "ITEM_LOGIN_REQUIRED"


def _transaction_signature(txn: Transaction) -> tuple[str, float, str, str, str]:
    return (
        txn.date or "",
        round(float(txn.amount or 0.0), 2),
        (txn.currency or "").strip().upper(),
        (txn.payee or "").strip(),
        txn.description or "",
    )


def _transaction_signature_counts(session: Session, account_id: int | None) -> Counter[tuple[str, float, str, str, str]]:
    if not account_id:
        return Counter()
    rows = session.execute(
        select(Transaction).where(Transaction.account_id == int(account_id))
    ).scalars().all()
    return Counter(_transaction_signature(row) for row in rows)


def _can_collapse_duplicate_account(
    session: Session,
    canonical_account_id: int | None,
    duplicate_account_id: int | None,
) -> tuple[bool, int, int]:
    canonical_counts = _transaction_signature_counts(session, canonical_account_id)
    duplicate_counts = _transaction_signature_counts(session, duplicate_account_id)
    extra_in_duplicate = 0
    extra_in_canonical = 0
    signatures = set(canonical_counts) | set(duplicate_counts)
    for signature in signatures:
        canonical_count = canonical_counts.get(signature, 0)
        duplicate_count = duplicate_counts.get(signature, 0)
        if duplicate_count > canonical_count:
            extra_in_duplicate += duplicate_count - canonical_count
        elif canonical_count > duplicate_count:
            extra_in_canonical += canonical_count - duplicate_count
    return extra_in_duplicate == 0, extra_in_duplicate, extra_in_canonical


def _merge_duplicate_transaction_state(session: Session, primary_id: int, duplicate_id: int) -> None:
    derived_tables = (
        TransactionSplit,
        TransactionMemory,
        ClassificationAudit,
    )
    relational_tables = (
        Attachment,
        TransactionTag,
        InvoicePaymentLink,
        DebtPaymentLink,
        ImportRow,
    )
    for table in derived_tables:
        primary_count = session.execute(
            select(func.count()).select_from(table).where(table.transaction_id == primary_id)
        ).scalar_one()
        if primary_count:
            session.execute(
                table.__table__.delete().where(table.transaction_id == duplicate_id)
            )
        else:
            session.execute(
                table.__table__.update()
                .where(table.transaction_id == duplicate_id)
                .values(transaction_id=primary_id)
            )
    for table in relational_tables:
        session.execute(
            table.__table__.update()
            .where(table.transaction_id == duplicate_id)
            .values(transaction_id=primary_id)
        )
    session.execute(
        PlaidTransaction.__table__.delete().where(PlaidTransaction.transaction_id == duplicate_id)
    )
    duplicate = session.execute(
        select(Transaction).where(Transaction.id == duplicate_id)
    ).scalar_one_or_none()
    if duplicate:
        session.delete(duplicate)


def _mark_duplicate_item_if_needed(session: Session, item_id: str, now: str) -> None:
    accounts = session.execute(
        select(PlaidAccount).where(PlaidAccount.item_id == item_id)
    ).scalars().all()
    item = session.execute(select(PlaidItem).where(PlaidItem.item_id == item_id)).scalar_one_or_none()
    if not item:
        return
    if accounts and all(account.is_active != 1 for account in accounts):
        item.status = "duplicate"
        item.updated_at = now


def deduplicate_plaid_links(session: Session) -> dict[str, Any]:
    now = _now_str()
    items = {
        item.item_id: item
        for item in session.execute(select(PlaidItem)).scalars().all()
    }
    groups: dict[tuple[str, str, str, str, str, str, str], list[PlaidAccount]] = defaultdict(list)
    for account in session.execute(select(PlaidAccount)).scalars().all():
        groups[_plaid_account_signature_from_model(items, account)].append(account)

    summary: dict[str, Any] = {
        "duplicate_groups": 0,
        "collapsed_accounts": 0,
        "deactivated_accounts": 0,
        "deleted_transactions": 0,
        "skipped_accounts": [],
    }

    for accounts in groups.values():
        if len(accounts) < 2:
            continue
        summary["duplicate_groups"] += 1
        ordered = sorted(accounts, key=lambda row: row.id)
        canonical = ordered[0]
        for duplicate in ordered[1:]:
            if duplicate.is_active != 1 and duplicate.account_id == canonical.account_id:
                _mark_duplicate_item_if_needed(session, duplicate.item_id, now)
                continue
            if duplicate.account_id == canonical.account_id:
                duplicate.is_active = 0
                duplicate.updated_at = now
                summary["deactivated_accounts"] += 1
                _mark_duplicate_item_if_needed(session, duplicate.item_id, now)
                continue

            can_collapse, extra_in_duplicate, extra_in_canonical = _can_collapse_duplicate_account(
                session,
                canonical.account_id,
                duplicate.account_id,
            )
            if not can_collapse:
                summary["skipped_accounts"].append(
                    {
                        "plaid_account_id": duplicate.plaid_account_id,
                        "local_account_id": duplicate.account_id,
                        "canonical_account_id": canonical.account_id,
                        "extra_in_duplicate": extra_in_duplicate,
                        "extra_in_canonical": extra_in_canonical,
                    }
                )
                continue

            duplicate_rows = session.execute(
                select(Transaction)
                .where(Transaction.account_id == duplicate.account_id)
                .order_by(Transaction.date, Transaction.id)
            ).scalars().all()
            canonical_rows = session.execute(
                select(Transaction)
                .where(Transaction.account_id == canonical.account_id)
                .order_by(Transaction.date, Transaction.id)
            ).scalars().all()
            canonical_pool: dict[tuple[str, float, str, str, str], list[int]] = defaultdict(list)
            for row in canonical_rows:
                canonical_pool[_transaction_signature(row)].append(row.id)

            deleted = 0
            for row in duplicate_rows:
                signature = _transaction_signature(row)
                primary_ids = canonical_pool.get(signature) or []
                if not primary_ids:
                    raise ValueError(
                        f"Duplicate Plaid account {duplicate.plaid_account_id} cannot be collapsed safely"
                    )
                primary_id = primary_ids.pop(0)
                _merge_duplicate_transaction_state(session, primary_id, row.id)
                deleted += 1

            duplicate_local_account = session.execute(
                select(Account).where(Account.id == duplicate.account_id)
            ).scalar_one_or_none()
            if duplicate_local_account:
                duplicate_local_account.is_active = 0
                duplicate_local_account.updated_at = now
                note = duplicate_local_account.note or ""
                marker = f"Duplicate Plaid link collapsed into account {canonical.account_id}"
                if marker not in note:
                    duplicate_local_account.note = f"{note} | {marker}".strip(" |")

            session.execute(
                PlaidTransaction.__table__.delete().where(PlaidTransaction.account_id == duplicate.account_id)
            )
            duplicate.account_id = canonical.account_id
            duplicate.is_active = 0
            duplicate.updated_at = now
            summary["collapsed_accounts"] += 1
            summary["deactivated_accounts"] += 1
            summary["deleted_transactions"] += deleted
            _mark_duplicate_item_if_needed(session, duplicate.item_id, now)

    return summary


def is_configured() -> bool:
    return bool(PLAID_CLIENT_ID and PLAID_SECRET and PLAID_ENV in PLAID_BASES)


def plaid_base_url() -> str:
    return PLAID_BASES.get(PLAID_ENV, PLAID_BASES["sandbox"])


def plaid_request(path: str, payload: dict, timeout: int = 20) -> dict:
    if not is_configured():
        raise ValueError("Plaid is not configured")
    url = f"{plaid_base_url()}{path}"
    body = {"client_id": PLAID_CLIENT_ID, "secret": PLAID_SECRET, **payload}
    res = requests.post(url, json=body, timeout=timeout)
    if not res.ok:
        try:
            data = res.json()
        except Exception:
            data = {"error_message": res.text}
        message = data.get("error_message") or data.get("display_message") or data.get("error_code") or res.text
        raise PlaidRequestError(
            path,
            message,
            error_code=data.get("error_code"),
            request_id=data.get("request_id"),
        )
    return res.json()


def _link_token_response(response: dict[str, Any]) -> dict[str, Any]:
    if PLAID_REDIRECT_URI:
        return {**response, "redirect_uri": PLAID_REDIRECT_URI}
    return response


def create_link_token() -> dict:
    payload: dict[str, Any] = {
        "client_name": "JAI Ledger",
        "language": "en",
        "country_codes": ["US"],
        "user": {"client_user_id": "local-user"},
        "products": ["transactions"],
    }
    if PLAID_REDIRECT_URI:
        payload["redirect_uri"] = PLAID_REDIRECT_URI
    payload["account_filters"] = {"depository": {"account_subtypes": ["checking"]}}
    return _link_token_response(plaid_request("/link/token/create", payload))


def create_update_link_token(session: Session, item_id: str | None = None) -> dict:
    query = select(PlaidItem).where(PlaidItem.status != "duplicate")
    if item_id:
        query = query.where(PlaidItem.item_id == item_id)
    query = query.order_by(PlaidItem.updated_at.desc(), PlaidItem.id.desc())
    item = session.execute(query).scalars().first()
    if not item:
        raise ValueError("Active Plaid item not found")

    payload: dict[str, Any] = {
        "client_name": "JAI Ledger",
        "language": "en",
        "country_codes": ["US"],
        "user": {"client_user_id": "local-user"},
        "access_token": item.access_token,
        "update": {"account_selection_enabled": True},
        "account_filters": {"depository": {"account_subtypes": ["checking"]}},
    }
    if PLAID_REDIRECT_URI:
        payload["redirect_uri"] = PLAID_REDIRECT_URI
    response = plaid_request("/link/token/create", payload)
    return _link_token_response(
        {**response, "item_id": item.item_id, "institution_name": item.institution_name}
    )


def exchange_public_token(session: Session, public_token: str, metadata: dict | None) -> dict:
    exchange = plaid_request("/item/public_token/exchange", {"public_token": public_token})
    access_token = exchange["access_token"]
    item_id = exchange["item_id"]

    institution_id = None
    institution_name = None
    if metadata:
        institution = metadata.get("institution") if isinstance(metadata, dict) else None
        if institution:
            institution_id = institution.get("institution_id")
            institution_name = institution.get("name")

    item = session.execute(select(PlaidItem).where(PlaidItem.item_id == item_id)).scalar_one_or_none()
    now = _now_str()
    if item:
        item.access_token = access_token
        item.institution_id = institution_id
        item.institution_name = institution_name or item.institution_name
        item.updated_at = now
    else:
        item = PlaidItem(
            item_id=item_id,
            access_token=access_token,
            institution_id=institution_id,
            institution_name=institution_name,
            status="active",
            cursor=None,
            created_at=now,
            updated_at=now,
        )
        session.add(item)
        session.flush()

    accounts_data = plaid_request("/accounts/get", {"access_token": access_token})
    accounts = accounts_data.get("accounts", [])
    account_summary = _sync_plaid_account_mappings(session, item, accounts, institution_name, now)
    active_accounts = int(account_summary["active_accounts"])
    duplicate_accounts = int(account_summary["duplicate_accounts"])

    if duplicate_accounts and active_accounts == 0:
        item.status = "duplicate"
        item.updated_at = now
    else:
        item.status = "active"
        item.updated_at = now

    return {"item_id": item_id, "accounts": account_summary["accounts"]}


def sync_transactions(session: Session, full: bool = False) -> dict:
    items = session.execute(
        select(PlaidItem).where(PlaidItem.status != "duplicate")
    ).scalars().all()
    if not items:
        return {"items": 0, "added": 0, "modified": 0, "removed": 0}

    totals = {
        "items": len(items),
        "added": 0,
        "modified": 0,
        "removed": 0,
        "balances_updated": 0,
        "accounts_created": 0,
        "duplicate_accounts_created": 0,
        "errors": [],
    }
    now = _now_str()
    for item in items:
        login_required = False
        try:
            account_summary = _refresh_plaid_account_balances(session, item, now)
            totals["balances_updated"] += int(account_summary["updated_accounts"])
            totals["accounts_created"] += int(account_summary["created_accounts"])
            totals["duplicate_accounts_created"] += int(account_summary["created_duplicate_accounts"])
        except PlaidRequestError as exc:
            logger.warning("Plaid account refresh failed for item %s", item.item_id, exc_info=True)
            login_required = _is_login_required_error(exc)
            totals["errors"].append(_plaid_error_payload(item, exc))

        cursor = None if full else item.cursor or None
        access_token = item.access_token
        added: list[dict] = []
        modified: list[dict] = []
        removed: list[dict] = []
        has_more = True
        try:
            while has_more:
                payload: dict[str, Any] = {"access_token": access_token}
                if cursor:
                    payload["cursor"] = cursor
                response = plaid_request("/transactions/sync", payload)
                added.extend(response.get("added", []))
                modified.extend(response.get("modified", []))
                removed.extend(response.get("removed", []))
                cursor = response.get("next_cursor")
                has_more = response.get("has_more", False)
        except PlaidRequestError as exc:
            logger.warning("Plaid transaction sync failed for item %s", item.item_id, exc_info=True)
            if _is_login_required_error(exc):
                login_required = True
            if login_required:
                item.status = "login_required"
            totals["errors"].append(_plaid_error_payload(item, exc))
            item.updated_at = now
            continue

        totals["added"] += _apply_transactions(session, added, now)
        totals["modified"] += _apply_transactions(session, modified, now, is_modified=True)
        totals["removed"] += _remove_transactions(session, removed)
        item.cursor = cursor
        item.status = "login_required" if login_required else "active"
        item.updated_at = now

    if not totals["errors"]:
        totals.pop("errors")
    return totals


def _apply_transactions(session: Session, transactions: list[dict], now: str, is_modified: bool = False) -> int:
    if not transactions:
        return 0
    count = 0
    for txn in transactions:
        plaid_transaction_id = txn.get("transaction_id")
        if not plaid_transaction_id:
            continue
        pending_transaction_id = txn.get("pending_transaction_id")
        plaid_account_id = txn.get("account_id")
        if not plaid_account_id:
            continue

        plaid_account = session.execute(
            select(PlaidAccount).where(PlaidAccount.plaid_account_id == plaid_account_id)
        ).scalar_one_or_none()
        if not plaid_account or not plaid_account.account_id or plaid_account.is_active != 1:
            continue

        mapping = session.execute(
            select(PlaidTransaction).where(PlaidTransaction.plaid_transaction_id == plaid_transaction_id)
        ).scalar_one_or_none()

        if not mapping and pending_transaction_id:
            mapping = session.execute(
                select(PlaidTransaction).where(PlaidTransaction.plaid_transaction_id == pending_transaction_id)
            ).scalar_one_or_none()
            if mapping:
                mapping.plaid_transaction_id = plaid_transaction_id
                mapping.pending_transaction_id = pending_transaction_id

        amount = txn.get("amount") or 0
        local_amount = -float(amount)
        name = txn.get("name") or "Plaid transaction"
        merchant = txn.get("merchant_name") or ""
        date = txn.get("date") or now[:10]
        pending = 1 if txn.get("pending") else 0
        currency = txn.get("iso_currency_code") or plaid_account.currency or "USD"
        mcc = txn.get("merchant_category_code") or txn.get("mcc")
        pfc = txn.get("personal_finance_category") or {}
        pfc_primary = pfc.get("primary")
        pfc_detailed = pfc.get("detailed")

        if mapping and mapping.transaction_id:
            transaction = session.execute(
                select(Transaction).where(Transaction.id == mapping.transaction_id)
            ).scalar_one_or_none()
            if transaction:
                previous_amount = float(transaction.amount or 0.0)
                has_split = (
                    session.execute(
                        select(TransactionSplit.id).where(TransactionSplit.transaction_id == transaction.id).limit(1)
                    ).scalar_one_or_none()
                    is not None
                )
                transaction.date = date
                transaction.amount = local_amount
                transaction.description = name
                transaction.payee = merchant or transaction.payee
                transaction.currency = currency
                transaction.updated_at = now
                transaction.reconciliation_state = feed_reconciliation_state(
                    transaction.reconciliation_state,
                    feed_pending=bool(pending),
                    has_split=has_split,
                )
                sync_full_amount_split(session, transaction.id, previous_amount, local_amount, currency)
                mapping.amount = local_amount
                mapping.date = date
                mapping.name = name
                mapping.merchant_name = merchant
                mapping.merchant_category_code = str(mcc) if mcc else None
                mapping.pfc_primary = pfc_primary
                mapping.pfc_detailed = pfc_detailed
                mapping.pending = pending
                try:
                    classify_transaction_record(
                        session,
                        transaction.id,
                        extra_payload={
                            "mcc": str(mcc) if mcc else None,
                            "pfc_primary": pfc_primary,
                            "pfc_detailed": pfc_detailed,
                        },
                    )
                except Exception:
                    logger.warning("Auto-classification failed for Plaid transaction %s", transaction.id, exc_info=True)
                count += 1
                continue

        if mapping and not is_modified:
            mapping.merchant_category_code = str(mcc) if mcc else None
            mapping.pfc_primary = pfc_primary
            mapping.pfc_detailed = pfc_detailed
            continue

        transaction, _classification_result, classification_error = ledger_ingestion.create_transaction(
            session,
            account_id=plaid_account.account_id,
            date=date,
            description=name,
            amount=local_amount,
            currency=currency,
            payee=merchant or None,
            notes=f"Plaid transaction {plaid_transaction_id}",
            classification="Personal",
            reconciliation_state="pending" if pending else "imported",
            auto_classify=True,
            classification_payload={
                "mcc": str(mcc) if mcc else None,
                "pfc_primary": pfc_primary,
                "pfc_detailed": pfc_detailed,
            },
        )

        if not mapping:
            mapping = PlaidTransaction(
                plaid_transaction_id=plaid_transaction_id,
                pending_transaction_id=pending_transaction_id,
                account_id=plaid_account.account_id,
                transaction_id=transaction.id,
                amount=local_amount,
                date=date,
                name=name,
                merchant_name=merchant,
                merchant_category_code=str(mcc) if mcc else None,
                pfc_primary=pfc_primary,
                pfc_detailed=pfc_detailed,
                pending=pending,
                created_at=now,
            )
            session.add(mapping)
        else:
            mapping.transaction_id = transaction.id
            mapping.account_id = plaid_account.account_id
            mapping.amount = local_amount
            mapping.date = date
            mapping.name = name
            mapping.merchant_name = merchant
            mapping.merchant_category_code = str(mcc) if mcc else None
            mapping.pfc_primary = pfc_primary
            mapping.pfc_detailed = pfc_detailed
            mapping.pending = pending
        if classification_error:
            logger.warning("Auto-classification failed for Plaid transaction %s: %s", transaction.id, classification_error)
        count += 1
    return count


def _remove_transactions(session: Session, removed: list[dict]) -> int:
    if not removed:
        return 0
    removed_count = 0
    for entry in removed:
        plaid_transaction_id = entry.get("transaction_id")
        if not plaid_transaction_id:
            continue
        mapping = session.execute(
            select(PlaidTransaction).where(PlaidTransaction.plaid_transaction_id == plaid_transaction_id)
        ).scalar_one_or_none()
        if not mapping:
            continue
        if mapping.transaction_id:
            transaction = session.execute(
                select(Transaction).where(Transaction.id == mapping.transaction_id)
            ).scalar_one_or_none()
            if transaction:
                session.delete(transaction)
        session.delete(mapping)
        removed_count += 1
    return removed_count
