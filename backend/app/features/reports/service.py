from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy import text, select

from ...core.ledger_filters import is_legacy_opening as _shared_is_legacy_opening
from ..budgeting.models import BudgetBucketTarget, BudgetCategoryTarget, BudgetMonth
from ..connectors.models import PlaidAccount, UpAccount
from ..ledger.models import Account, Transaction, TransactionSplit
from ..taxonomy.models import Category, Subcategory
from ..timesheets.models import Project, TimeEntry
from ..taxonomy.service import FRIENDS_CATEGORY_NAME
from ..ledger.account_roles import account_cash_role, is_business_account
from ..taxonomy.service import (
    BUDGET_BUCKETS,
    budget_bucket_key_for_category,
    get_budget_bucket,
    require_budget_bucket,
)
from ..fx.currency import convert_amount, get_recent_fortnightly_average_aud_per_usd
from ..settings.service import get_base_currency

BUDGET_CASH_ACCOUNT_TYPES = {"bank", "checking"}
BUDGET_CASH_TOLERANCE = 50.0


def _exclude_legacy_opening(alias: str = "") -> str:
    prefix = f"{alias}." if alias else ""
    return (
        f"lower({prefix}description) NOT LIKE 'legacy opening balance%' "
        f"AND lower({prefix}description) NOT LIKE 'legacy balance adjustment%'"
    )


def _is_legacy_opening(description: str | None, notes: str | None, payee: str | None) -> bool:
    return _shared_is_legacy_opening(description, notes, payee)


def _load_unbudgetable_transaction_ids(session) -> set[int]:
    rows = session.execute(
        select(Transaction.id, Transaction.classification, Category.name, Account)
        .select_from(Transaction)
        .join(Account, Account.id == Transaction.account_id)
        .join(TransactionSplit, TransactionSplit.transaction_id == Transaction.id, isouter=True)
        .join(Category, Category.id == TransactionSplit.category_id, isouter=True)
    ).all()
    transfer_ids: set[int] = set()
    for txn_id, txn_classification, name, account in rows:
        if is_business_account(account):
            transfer_ids.add(txn_id)
            continue
        if (txn_classification or "").lower() == "business":
            transfer_ids.add(txn_id)
            continue
        lowered = (name or "").lower()
        if lowered == "business":
            transfer_ids.add(txn_id)
            continue
        if "transfer" in lowered or lowered == FRIENDS_CATEGORY_NAME.lower():
            transfer_ids.add(txn_id)
    return transfer_ids


def _is_direct_debit_dishonour(description: str | None) -> bool:
    return (description or "").strip().lower() == "direct debit dishonour"


def _load_budget_reversal_transaction_ids(session) -> set[int]:
    rows = session.execute(
        select(
            Transaction.id,
            Transaction.account_id,
            Transaction.date,
            Transaction.amount,
            Transaction.currency,
            Transaction.description,
        ).order_by(Transaction.date, Transaction.id)
    ).all()
    dishonours: list[dict[str, Any]] = []
    charges: list[dict[str, Any]] = []
    for txn_id, account_id, txn_date, amount, currency, description in rows:
        try:
            txn_amount = float(amount or 0.0)
        except (TypeError, ValueError):
            continue
        row = {
            "id": int(txn_id),
            "account_id": int(account_id),
            "date": date.fromisoformat(str(txn_date)),
            "amount": txn_amount,
            "currency": currency or "",
            "description": description or "",
        }
        if _is_direct_debit_dishonour(description) and txn_amount > 0:
            dishonours.append(row)
        elif txn_amount < 0:
            charges.append(row)
    used_charge_ids: set[int] = set()
    excluded_ids: set[int] = set()
    for dishonour in dishonours:
        matches = [
            charge
            for charge in charges
            if charge["id"] not in used_charge_ids
            and charge["account_id"] == dishonour["account_id"]
            and charge["currency"] == dishonour["currency"]
            and abs(charge["amount"] + dishonour["amount"]) < 0.005
            and abs((charge["date"] - dishonour["date"]).days) <= 7
        ]
        if not matches:
            continue
        matches.sort(
            key=lambda charge: (
                abs((charge["date"] - dishonour["date"]).days),
                0 if charge["date"] <= dishonour["date"] else 1,
                charge["id"],
            )
        )
        match = matches[0]
        used_charge_ids.add(match["id"])
        excluded_ids.add(dishonour["id"])
        excluded_ids.add(match["id"])
    return excluded_ids


def _conversion_context(session) -> tuple[str, dict[str, Any]]:
    return get_base_currency(session), get_recent_fortnightly_average_aud_per_usd(session)


def _convert_value(value: float, currency: str | None, base_currency: str, fx_summary: dict[str, Any]) -> float:
    return convert_amount(value, currency or base_currency, base_currency, fx_summary.get("aud_per_usd"))


def _liquid_balance_before_date(session, date_exclusive: str) -> float:
    base_currency, fx_summary = _conversion_context(session)
    rows = session.execute(
        select(Transaction.amount, Transaction.currency, Account)
        .select_from(Transaction)
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.date < date_exclusive)
    ).all()
    total = 0.0
    for amount, currency, account in rows:
        if (account.type or "").lower() not in BUDGET_CASH_ACCOUNT_TYPES:
            continue
        if is_business_account(account):
            continue
        total += _convert_value(float(amount or 0.0), currency, base_currency, fx_summary)
    return total


def _budget_role_for_bucket(bucket_key: str | None) -> str:
    bucket = get_budget_bucket(bucket_key)
    return bucket.type if bucket else "expense"


def _current_month_label(now: datetime | None = None) -> str:
    reference = now or datetime.now()
    return reference.strftime("%Y-%m")


def _month_state(month: str, current_month: str | None = None) -> str:
    reference = current_month or _current_month_label()
    if month < reference:
        return "past"
    if month > reference:
        return "future"
    return "current"


def _effective_budget_amount(
    month: str,
    bucket_type: str,
    planned_amount: float,
    has_plan: bool,
    actual_amount: float,
    current_month: str | None = None,
) -> float:
    state = _month_state(month, current_month)
    if state == "past":
        return float(actual_amount or 0.0)
    if has_plan:
        return float(planned_amount or 0.0)
    return float(actual_amount or 0.0)


def _load_converted_transactions(
    session,
    start_date: str | None = None,
    end_date: str | None = None,
    classification: str | None = None,
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    base_currency, fx_summary = _conversion_context(session)
    excluded_ids = _load_budget_reversal_transaction_ids(session)
    query = select(Transaction)
    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
    if classification:
        query = query.where(Transaction.classification == classification)
    rows = session.execute(query).scalars().all()
    results: list[dict[str, Any]] = []
    for txn in rows:
        if txn.id in excluded_ids:
            continue
        if _is_legacy_opening(txn.description, txn.notes, txn.payee):
            continue
        amount_base = _convert_value(float(txn.amount or 0.0), txn.currency, base_currency, fx_summary)
        results.append(
            {
                "transaction_id": txn.id,
                "account_id": txn.account_id,
                "date": txn.date,
                "month": str(txn.date)[:7],
                "currency": base_currency,
                "native_currency": txn.currency,
                "native_amount": float(txn.amount or 0.0),
                "amount": amount_base,
                "classification": txn.classification,
                "description": txn.description,
                "payee": txn.payee,
                "notes": txn.notes,
            }
        )
    return base_currency, fx_summary, results


def _account_map_for_transaction_rows(session, rows: list[dict[str, Any]]) -> dict[int, Account]:
    account_ids = {int(row["account_id"]) for row in rows if row.get("account_id") is not None}
    if not account_ids:
        return {}
    return {
        int(account.id): account
        for account in session.execute(select(Account).where(Account.id.in_(account_ids))).scalars().all()
    }


def _load_converted_splits(
    session,
    start_date: str | None = None,
    end_date: str | None = None,
    exclude_unbudgetable: bool = False,
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    base_currency, fx_summary = _conversion_context(session)
    excluded_ids = _load_budget_reversal_transaction_ids(session)
    if exclude_unbudgetable:
        excluded_ids |= _load_unbudgetable_transaction_ids(session)
    query = (
        select(TransactionSplit, Transaction, Category.name, Subcategory.name)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Category, Category.id == TransactionSplit.category_id, isouter=True)
        .join(Subcategory, Subcategory.id == TransactionSplit.subcategory_id, isouter=True)
    )
    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
    rows = session.execute(query).all()
    results: list[dict[str, Any]] = []
    for split, txn, category_name, subcategory_name in rows:
        if exclude_unbudgetable and txn.id in excluded_ids:
            continue
        if _is_legacy_opening(txn.description, txn.notes, txn.payee):
            continue
        split_currency = split.currency or txn.currency or base_currency
        amount_base = _convert_value(float(split.amount or 0.0), split_currency, base_currency, fx_summary)
        results.append(
            {
                "transaction_id": txn.id,
                "category_id": split.category_id,
                "category_name": category_name,
                "subcategory_id": split.subcategory_id,
                "subcategory_name": subcategory_name,
                "date": str(txn.date),
                "month": str(txn.date)[:7],
                "currency": base_currency,
                "native_currency": split_currency,
                "native_amount": float(split.amount or 0.0),
                "amount": amount_base,
            }
        )
    return base_currency, fx_summary, results


def _subcategory_budget_actuals(
    session,
    start_date: str,
    end_date: str,
) -> tuple[str, dict[str, Any], dict[tuple[str, str, str], dict[str, float]], dict[tuple[str, str], dict[str, Any]]]:
    base_currency, fx_summary, rows = _load_converted_splits(
        session,
        start_date=start_date,
        end_date=end_date,
        exclude_unbudgetable=True,
    )
    raw_map: dict[tuple[str, str, str], dict[str, float]] = {}
    info_map: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        month = row["month"]
        bucket_key = budget_bucket_key_for_category(row["category_name"])
        if not month or not bucket_key:
            continue
        subcategory_id = row.get("subcategory_id")
        subcategory_key = str(subcategory_id) if subcategory_id is not None else "unassigned"
        info_map[(bucket_key, subcategory_key)] = {
            "id": subcategory_key,
            "subcategory_id": subcategory_id,
            "name": row.get("subcategory_name") or "Unassigned",
            "is_unassigned": subcategory_id is None,
        }
        entry = raw_map.setdefault(
            (bucket_key, subcategory_key, month),
            {"positive_amount": 0.0, "negative_amount": 0.0},
        )
        amount = float(row["amount"] or 0.0)
        if amount > 0:
            entry["positive_amount"] += amount
        elif amount < 0:
            entry["negative_amount"] += -amount
    actual_map: dict[tuple[str, str, str], dict[str, float]] = {}
    for key, entry in raw_map.items():
        role = _budget_role_for_bucket(key[0])
        if role == "income":
            actual_map[key] = {
                "income": float(entry["positive_amount"] or 0.0),
                "expense": float(entry["negative_amount"] or 0.0),
            }
        else:
            actual_map[key] = {
                "income": 0.0,
                "expense": max(
                    float(entry["negative_amount"] or 0.0) - float(entry["positive_amount"] or 0.0),
                    0.0,
                ),
            }
    return base_currency, fx_summary, actual_map, info_map


def _defined_subcategory_info(session) -> dict[tuple[str, str], dict[str, Any]]:
    rows = session.execute(
        select(Category.name, Subcategory.id, Subcategory.name)
        .join(Subcategory, Subcategory.category_id == Category.id)
        .where(Category.is_active == 1, Subcategory.is_active == 1)
        .order_by(Category.name, Subcategory.name)
    ).all()
    info_map: dict[tuple[str, str], dict[str, Any]] = {}
    for category_name, subcategory_id, subcategory_name in rows:
        bucket_key = budget_bucket_key_for_category(category_name)
        if not bucket_key or subcategory_id is None:
            continue
        subcategory_key = str(int(subcategory_id))
        info_map[(bucket_key, subcategory_key)] = {
            "id": subcategory_key,
            "subcategory_id": int(subcategory_id),
            "name": subcategory_name,
            "is_unassigned": False,
        }
    return info_map


def _bucket_budget_actuals(
    session, start_date: str, end_date: str
) -> tuple[str, dict[str, Any], dict[tuple[str, str], dict[str, float]], set[str]]:
    base_currency, fx_summary, rows = _load_converted_splits(
        session,
        start_date=start_date,
        end_date=end_date,
        exclude_unbudgetable=True,
    )
    raw_map: dict[tuple[str, str], dict[str, float]] = {}
    bucket_keys: set[str] = set()
    for row in rows:
        month = row["month"]
        bucket_key = budget_bucket_key_for_category(row["category_name"])
        if not month or not bucket_key:
            continue
        entry = raw_map.setdefault((bucket_key, month), {"positive_amount": 0.0, "negative_amount": 0.0})
        amount = float(row["amount"] or 0.0)
        if amount > 0:
            entry["positive_amount"] += amount
        elif amount < 0:
            entry["negative_amount"] += -amount
        bucket_keys.add(bucket_key)
    actual_map: dict[tuple[str, str], dict[str, float]] = {}
    for key, entry in raw_map.items():
        role = _budget_role_for_bucket(key[0])
        if role == "income":
            actual_map[key] = {
                "income": float(entry["positive_amount"] or 0.0),
                "expense": float(entry["negative_amount"] or 0.0),
            }
        else:
            actual_map[key] = {
                "income": 0.0,
                "expense": max(
                    float(entry["negative_amount"] or 0.0) - float(entry["positive_amount"] or 0.0),
                    0.0,
                ),
            }
    return base_currency, fx_summary, actual_map, bucket_keys


def budget_bucket_transactions(
    session,
    month: str,
    bucket_key: str,
    *,
    subcategory_id: int | None = None,
    unassigned: bool = False,
) -> dict[str, Any]:
    bucket = require_budget_bucket(bucket_key)
    if len(month or "") != 7:
        raise ValueError("Month must be in YYYY-MM format")
    start_date = f"{month}-01"
    end_date = f"{month}-31"
    base_currency, fx_summary = _conversion_context(session)
    excluded_ids = _load_budget_reversal_transaction_ids(session) | _load_unbudgetable_transaction_ids(session)
    query = (
        select(TransactionSplit, Transaction, Category.name, Account.name, Subcategory.name)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Category, Category.id == TransactionSplit.category_id, isouter=True)
        .join(Account, Account.id == Transaction.account_id)
        .join(Subcategory, Subcategory.id == TransactionSplit.subcategory_id, isouter=True)
        .where(Transaction.date >= start_date, Transaction.date <= end_date)
    )
    rows = session.execute(query).all()
    transactions: list[dict[str, Any]] = []
    positive_amount = 0.0
    negative_amount = 0.0
    for split, txn, category_name, account_name, subcategory_name in rows:
        if txn.id in excluded_ids:
            continue
        if _is_legacy_opening(txn.description, txn.notes, txn.payee):
            continue
        if budget_bucket_key_for_category(category_name) != bucket.key:
            continue
        if unassigned and split.subcategory_id is not None:
            continue
        if subcategory_id is not None and int(split.subcategory_id or 0) != int(subcategory_id):
            continue
        split_currency = split.currency or txn.currency or base_currency
        amount_base = _convert_value(float(split.amount or 0.0), split_currency, base_currency, fx_summary)
        if bucket.type == "income":
            effect_on_actual = amount_base if amount_base > 0 else 0.0
        else:
            effect_on_actual = -amount_base
        if amount_base > 0:
            positive_amount += amount_base
        elif amount_base < 0:
            negative_amount += -amount_base
        transactions.append(
            {
                "split_id": int(split.id),
                "transaction_id": int(txn.id),
                "date": str(txn.date),
                "account_name": account_name,
                "description": txn.description,
                "payee": txn.payee,
                "category_id": split.category_id,
                "category_name": category_name,
                "subcategory_id": split.subcategory_id,
                "subcategory_name": subcategory_name,
                "currency": base_currency,
                "amount": amount_base,
                "native_amount": float(split.amount or 0.0),
                "native_currency": split_currency,
                "effect_on_actual": effect_on_actual,
            }
        )
    transactions.sort(
        key=lambda row: (
            str(row.get("date") or ""),
            abs(float(row.get("effect_on_actual") or 0.0)),
            int(row.get("transaction_id") or 0),
        ),
        reverse=True,
    )
    if bucket.type == "income":
        actual_total = positive_amount
    else:
        actual_total = max(negative_amount - positive_amount, 0.0)
    return {
        "month": month,
        "budget_bucket": bucket.key,
        "bucket_name": bucket.name,
        "subcategory_id": subcategory_id,
        "unassigned": bool(unassigned),
        "bucket_type": bucket.type,
        "base_currency": base_currency,
        "actual_total": actual_total,
        "transactions": transactions,
    }


def cashflow_by_month(session) -> list[dict]:
    base_currency, _, rows = _load_converted_transactions(session)
    account_map = _account_map_for_transaction_rows(session, rows)
    monthly: dict[str, dict[str, float]] = {}
    for row in rows:
        month = row["month"] or "Unknown"
        entry = monthly.setdefault(
            month,
            {
                "inflow": 0.0,
                "outflow": 0.0,
                "net": 0.0,
                "business_inflow": 0.0,
                "business_outflow": 0.0,
                "business_net": 0.0,
                "total_inflow": 0.0,
                "total_outflow": 0.0,
                "total_net": 0.0,
            },
        )
        amount = float(row["amount"] or 0.0)
        account = account_map.get(int(row["account_id"])) if row.get("account_id") is not None else None
        prefix = "business_" if account_cash_role(account) == "business" else ""
        if amount > 0:
            entry[f"{prefix}inflow"] += amount
            entry["total_inflow"] += amount
        elif amount < 0:
            entry[f"{prefix}outflow"] += -amount
            entry["total_outflow"] += -amount
        entry[f"{prefix}net"] += amount
        entry["total_net"] += amount
    return [
        {
            "month": month,
            "currency": base_currency,
            "inflow": values["inflow"],
            "outflow": values["outflow"],
            "net": values["net"],
            "business_inflow": values["business_inflow"],
            "business_outflow": values["business_outflow"],
            "business_net": values["business_net"],
            "total_inflow": values["total_inflow"],
            "total_outflow": values["total_outflow"],
            "total_net": values["total_net"],
        }
        for month, values in sorted(monthly.items())
    ]


def category_spend(session) -> list[dict]:
    base_currency, _, splits = _load_converted_splits(session, exclude_unbudgetable=True)
    totals: dict[str, float] = defaultdict(float)
    dates: dict[str, list[str]] = defaultdict(list)
    for row in splits:
        category_name = row["category_name"] or "Uncategorized"
        amount = float(row["amount"] or 0.0)
        if amount < 0:
            totals[category_name] += -amount
            dates[category_name].append(str(row["date"]))
    return [
        {
            "category": category,
            "total": total,
            "currency": base_currency,
            "start_date": min(dates[category]) if dates[category] else None,
            "end_date": max(dates[category]) if dates[category] else None,
            "transaction_count": len(dates[category]),
        }
        for category, total in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]


def business_pnl(session) -> list[dict]:
    base_currency, _, rows = _load_converted_transactions(session, classification="Business")
    monthly: dict[str, dict[str, float]] = {}
    for row in rows:
        month = row["month"] or "Unknown"
        entry = monthly.setdefault(month, {"income": 0.0, "expenses": 0.0, "net": 0.0})
        amount = float(row["amount"] or 0.0)
        if amount > 0:
            entry["income"] += amount
        elif amount < 0:
            entry["expenses"] += -amount
        entry["net"] += amount
    return [
        {
            "month": month,
            "currency": base_currency,
            "income": values["income"],
            "expenses": values["expenses"],
            "net": values["net"],
        }
        for month, values in sorted(monthly.items())
    ]


def _provider_balance_map(session) -> dict[int, dict[str, Any]]:
    provider_map: dict[int, dict[str, Any]] = {}

    plaid_rows = session.execute(
        select(
            PlaidAccount.account_id,
            PlaidAccount.current_balance,
            PlaidAccount.available_balance,
            PlaidAccount.balance_as_of,
            PlaidAccount.is_active,
        )
    ).all()
    for account_id, current_balance, available_balance, balance_as_of, is_active in plaid_rows:
        if not account_id or int(is_active or 0) != 1:
            continue
        if current_balance is None and available_balance is None:
            continue
        existing = provider_map.get(int(account_id))
        candidate = {
            "source": "plaid",
            "current_balance": float(current_balance) if current_balance is not None else None,
            "available_balance": float(available_balance) if available_balance is not None else None,
            "balance_as_of": balance_as_of,
        }
        if not existing or (candidate["balance_as_of"] or "") > (existing.get("balance_as_of") or ""):
            provider_map[int(account_id)] = candidate

    up_rows = session.execute(
        select(
            UpAccount.account_id,
            UpAccount.current_balance,
            UpAccount.available_balance,
            UpAccount.balance_as_of,
            UpAccount.is_active,
        )
    ).all()
    for account_id, current_balance, available_balance, balance_as_of, is_active in up_rows:
        if not account_id or int(is_active or 0) != 1:
            continue
        if current_balance is None and available_balance is None:
            continue
        existing = provider_map.get(int(account_id))
        candidate = {
            "source": "up",
            "current_balance": float(current_balance) if current_balance is not None else None,
            "available_balance": float(available_balance) if available_balance is not None else None,
            "balance_as_of": balance_as_of,
        }
        if not existing or (candidate["balance_as_of"] or "") > (existing.get("balance_as_of") or ""):
            provider_map[int(account_id)] = candidate

    return provider_map


def net_worth(session) -> dict:
    rows = session.execute(
        text(
            """
            SELECT a.id AS account_id,
                   a.name AS account_name,
                   a.type AS account_type,
                   a.currency AS currency,
                   a.institution AS institution,
                   a.note AS note,
                   a.is_active AS is_active,
                   COUNT(t.id) AS transaction_count,
                   COALESCE(SUM(t.amount), 0) AS balance
            FROM account a
            LEFT JOIN transactions t ON t.account_id = a.id
            GROUP BY a.id, a.name, a.type, a.currency, a.institution, a.note, a.is_active
            ORDER BY a.name
            """
        )
    ).mappings().all()
    base_currency, fx_summary = _conversion_context(session)
    accounts = []
    total = 0.0
    asset_total = 0.0
    liability_total = 0.0
    checking_total = 0.0
    business_checking_total = 0.0
    all_checking_total = 0.0
    checking_account_count = 0
    business_checking_account_count = 0
    all_checking_account_count = 0
    checking_provider_account_count = 0
    business_checking_provider_account_count = 0
    all_checking_provider_account_count = 0
    checking_ledger_fallback_count = 0
    business_checking_ledger_fallback_count = 0
    all_checking_ledger_fallback_count = 0
    checking_as_of_values: list[str] = []
    business_checking_as_of_values: list[str] = []
    all_checking_as_of_values: list[str] = []
    provider_map = _provider_balance_map(session)
    for row in rows:
        tx_count = int(row.get("transaction_count") or 0)
        ledger_native_balance = float(row["balance"] or 0.0)
        provider = provider_map.get(int(row["account_id"]))
        provider_native_balance = None
        if provider:
            provider_native_balance = provider.get("available_balance")
            if provider_native_balance is None:
                provider_native_balance = provider.get("current_balance")
        effective_native_balance = (
            float(provider_native_balance) if provider_native_balance is not None else ledger_native_balance
        )
        if not int(row.get("is_active") or 0) and abs(effective_native_balance) < 0.005 and tx_count == 0:
            continue
        if abs(effective_native_balance) < 0.005 and tx_count == 0 and provider_native_balance is None:
            continue
        native_currency = row["currency"] or base_currency
        ledger_balance_base = _convert_value(ledger_native_balance, native_currency, base_currency, fx_summary)
        balance_base = _convert_value(effective_native_balance, native_currency, base_currency, fx_summary)
        data = dict(row)
        data["ledger_balance"] = ledger_native_balance
        data["ledger_balance_base"] = ledger_balance_base
        data["provider_current_balance"] = provider.get("current_balance") if provider else None
        data["provider_available_balance"] = provider.get("available_balance") if provider else None
        data["balance_as_of"] = provider.get("balance_as_of") if provider else None
        data["balance_source"] = provider.get("source") if provider else "ledger"
        data["display_balance"] = effective_native_balance
        data["display_balance_base"] = balance_base
        data["balance_base"] = balance_base
        data["base_currency"] = base_currency
        account_type = str(row.get("account_type") or "").lower()
        cash_role = account_cash_role(row)
        data["cash_role"] = cash_role
        included_in_cash_total = int(row.get("is_active") or 0) == 1 and account_type in BUDGET_CASH_ACCOUNT_TYPES
        included_in_total = included_in_cash_total and cash_role == "personal"
        data["included_in_total"] = included_in_total
        data["included_in_cash_total"] = included_in_cash_total
        accounts.append(data)
        total += ledger_balance_base
        is_liability = account_type in {"credit card", "loan", "student loan"}
        if is_liability:
            liability_total += abs(ledger_balance_base)
        else:
            asset_total += ledger_balance_base
        if included_in_cash_total:
            all_checking_total += balance_base
            all_checking_account_count += 1
            if provider:
                all_checking_provider_account_count += 1
                if provider.get("balance_as_of"):
                    all_checking_as_of_values.append(str(provider["balance_as_of"]))
            else:
                all_checking_ledger_fallback_count += 1
            if cash_role == "business":
                business_checking_total += balance_base
                business_checking_account_count += 1
                if provider:
                    business_checking_provider_account_count += 1
                    if provider.get("balance_as_of"):
                        business_checking_as_of_values.append(str(provider["balance_as_of"]))
                else:
                    business_checking_ledger_fallback_count += 1
            else:
                checking_total += balance_base
                checking_account_count += 1
                if provider:
                    checking_provider_account_count += 1
                    if provider.get("balance_as_of"):
                        checking_as_of_values.append(str(provider["balance_as_of"]))
                else:
                    checking_ledger_fallback_count += 1
    return {
        "total": total,
        "base_currency": base_currency,
        "asset_total": asset_total,
        "liability_total": liability_total,
        "checking_total": checking_total,
        "personal_checking_total": checking_total,
        "business_checking_total": business_checking_total,
        "all_checking_total": all_checking_total,
        "checking_account_count": checking_account_count,
        "personal_checking_account_count": checking_account_count,
        "business_checking_account_count": business_checking_account_count,
        "all_checking_account_count": all_checking_account_count,
        "checking_provider_account_count": checking_provider_account_count,
        "personal_checking_provider_account_count": checking_provider_account_count,
        "business_checking_provider_account_count": business_checking_provider_account_count,
        "all_checking_provider_account_count": all_checking_provider_account_count,
        "checking_ledger_fallback_count": checking_ledger_fallback_count,
        "personal_checking_ledger_fallback_count": checking_ledger_fallback_count,
        "business_checking_ledger_fallback_count": business_checking_ledger_fallback_count,
        "all_checking_ledger_fallback_count": all_checking_ledger_fallback_count,
        "checking_as_of": min(checking_as_of_values) if checking_as_of_values else None,
        "personal_checking_as_of": min(checking_as_of_values) if checking_as_of_values else None,
        "business_checking_as_of": min(business_checking_as_of_values) if business_checking_as_of_values else None,
        "all_checking_as_of": min(all_checking_as_of_values) if all_checking_as_of_values else None,
        "fx_reference": fx_summary,
        "accounts": accounts,
    }


def _legacy_bucket_totals_for_month(session, budget_month_id: int) -> dict[str, dict[str, float | int | None]]:
    rows = session.execute(
        select(BudgetCategoryTarget, Category.name)
        .join(Category, Category.id == BudgetCategoryTarget.category_id)
        .where(BudgetCategoryTarget.budget_month_id == budget_month_id)
    ).all()
    budget_map: dict[str, dict[str, float | int | None]] = {}
    for target, category_name in rows:
        bucket_key = budget_bucket_key_for_category(category_name)
        if not bucket_key:
            continue
        entry = budget_map.setdefault(bucket_key, {"amount": 0.0, "rollover": 0.0, "target_id": None})
        entry["amount"] += float(target.amount or 0.0)
        entry["rollover"] += float(target.rollover_amount or 0.0)
    return budget_map


def _bucket_totals_for_month(session, budget_month_id: int) -> dict[str, dict[str, float | int | None]]:
    rows = session.execute(
        select(BudgetBucketTarget).where(BudgetBucketTarget.budget_month_id == budget_month_id)
    ).scalars().all()
    if rows:
        return {
            str(row.budget_bucket): {
                "amount": float(row.amount or 0.0),
                "rollover": float(row.rollover_amount or 0.0),
                "target_id": int(row.id),
            }
            for row in rows
        }
    return _legacy_bucket_totals_for_month(session, budget_month_id)


def _bucket_totals_for_year(session, year: int) -> dict[tuple[str, str], dict[str, float | int | None]]:
    months = session.execute(
        select(BudgetMonth.id, BudgetMonth.month).where(BudgetMonth.month.like(f"{year}-%"))
    ).all()
    month_lookup = {str(month): int(month_id) for month_id, month in months}
    bucket_rows = session.execute(
        text(
            """
            SELECT bbt.budget_bucket AS bucket_key,
                   bm.month AS month,
                   bbt.id AS target_id,
                   bbt.amount AS amount,
                   bbt.rollover_amount AS rollover_amount
            FROM budget_bucket_target bbt
            JOIN budget_month bm ON bm.id = bbt.budget_month_id
            WHERE bm.month LIKE :prefix
            """
        ),
        {"prefix": f"{year}-%"},
    ).mappings().all()
    budget_map: dict[tuple[str, str], dict[str, float | int | None]] = {}
    months_with_bucket_targets = {str(row["month"]) for row in bucket_rows}
    for row in bucket_rows:
        budget_map[(str(row["bucket_key"]), str(row["month"]))] = {
            "target_id": int(row["target_id"]),
            "amount": float(row["amount"] or 0.0),
            "rollover": float(row["rollover_amount"] or 0.0),
        }
    for month, month_id in month_lookup.items():
        if month in months_with_bucket_targets:
            continue
        for bucket_key, values in _legacy_bucket_totals_for_month(session, month_id).items():
            budget_map[(bucket_key, month)] = values
    return budget_map


def budget_status(session, month: str | None = None) -> dict:
    month_row = None
    if month:
        month_row = session.execute(
            text("SELECT id, month, rollover_enabled FROM budget_month WHERE month = :month"),
            {"month": month},
        ).mappings().first()
        if not month_row:
            month_row = {
                "id": None,
                "month": month,
                "rollover_enabled": 0,
            }
    if not month_row:
        month_row = session.execute(
            text("SELECT id, month, rollover_enabled FROM budget_month ORDER BY month DESC LIMIT 1")
        ).mappings().first()
    if not month_row:
        return {
            "month": None,
            "base_currency": get_base_currency(session),
            "targets": [],
            "total_target": 0.0,
            "total_spent": 0.0,
            "total_remaining": 0.0,
        }

    base_currency, _, actual_map, _ = _bucket_budget_actuals(
        session,
        f"{month_row['month']}-01",
        f"{month_row['month']}-31",
    )
    budget_map = _bucket_totals_for_month(session, int(month_row["id"])) if month_row["id"] else {}

    targets = []
    total_target = 0.0
    total_spent = 0.0
    for bucket in BUDGET_BUCKETS:
        budget = budget_map.get(bucket.key, {"amount": 0.0, "rollover": 0.0})
        target = float(budget.get("amount") or 0.0) + float(budget.get("rollover") or 0.0)
        actual = actual_map.get((bucket.key, month_row["month"]), {"income": 0.0, "expense": 0.0})
        role = bucket.type
        spent = actual.get("income") if role == "income" else actual.get("expense")
        spent = spent or 0.0
        remaining = target - spent
        if target <= 0 and spent <= 0:
            continue
        targets.append(
            {
                "target_id": bucket.key,
                "category": bucket.name,
                "bucket_key": bucket.key,
                "target": target,
                "spent": spent,
                "remaining": remaining,
            }
        )
        total_target += target
        total_spent += spent

    return {
        "month": month_row["month"],
        "base_currency": base_currency,
        "targets": targets,
        "total_target": total_target,
        "total_spent": total_spent,
        "total_remaining": total_target - total_spent,
    }


def timesheet_summary(session) -> dict:
    by_project_rows = session.execute(
        text(
            """
            SELECT project_id, SUM(duration_minutes) / 60.0 AS hours
            FROM time_entry
            GROUP BY project_id
            """
        )
    ).mappings().all()

    by_month_rows = session.execute(
        text(
            """
            SELECT substr(date, 1, 7) AS month, SUM(duration_minutes) / 60.0 AS hours
            FROM time_entry
            GROUP BY month
            ORDER BY month
            """
        )
    ).mappings().all()

    by_week_rows = session.execute(
        text(
            """
            SELECT strftime('%Y-%W', date) AS week, SUM(duration_minutes) / 60.0 AS hours
            FROM time_entry
            GROUP BY week
            ORDER BY week
            """
        )
    ).mappings().all()

    billable = session.execute(
        text(
            """
            SELECT
              SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) / 60.0 AS billable_hours,
              SUM(CASE WHEN billable = 0 THEN duration_minutes ELSE 0 END) / 60.0 AS non_billable_hours
            FROM time_entry
            """
        )
    ).mappings().one()

    project_map = {p.id: p for p in session.execute(select(Project)).scalars().all()}
    entries = session.execute(select(TimeEntry)).scalars().all()
    revenue = 0.0
    total_hours = 0.0
    for entry in entries:
        hours = entry.duration_minutes / 60.0
        rate = entry.hourly_rate
        if rate is None:
            project = project_map.get(entry.project_id)
            rate = project.hourly_rate if project else 0.0
        revenue += hours * (rate or 0.0)
        total_hours += hours

    effective_rate = revenue / total_hours if total_hours > 0 else 0.0

    billable_hours = float(billable.get("billable_hours") or 0.0)
    non_billable_hours = float(billable.get("non_billable_hours") or 0.0)
    total_hours = billable_hours + non_billable_hours

    return {
        "by_project": [dict(r) for r in by_project_rows],
        "by_month": [dict(r) for r in by_month_rows],
        "by_week": [dict(r) for r in by_week_rows],
        "billable": dict(billable),
        "billable_hours": billable_hours,
        "non_billable_hours": non_billable_hours,
        "total_hours": total_hours,
        "effective_hourly_rate": effective_rate,
    }


def expense_analysis(session, months: int = 6) -> dict:
    latest = _latest_txn_date(session)
    if not latest:
        return {
            "start_date": None,
            "base_currency": get_base_currency(session),
            "monthly": [],
            "categories": [],
            "merchants": [],
            "avg_spend": 0.0,
        }
    start_date = _month_start(latest, max(months - 1, 0))
    base_currency, _, txns = _load_converted_transactions(session, start_date=start_date)
    account_map = _account_map_for_transaction_rows(session, txns)
    monthly_map: dict[str, dict[str, float]] = {}
    merchant_totals: dict[str, float] = defaultdict(float)
    for row in txns:
        account = account_map.get(int(row["account_id"])) if row.get("account_id") is not None else None
        if account_cash_role(account) == "business":
            continue
        if (row.get("classification") or "").lower() == "business":
            continue
        month = row["month"] or "Unknown"
        entry = monthly_map.setdefault(month, {"inflow": 0.0, "outflow": 0.0, "net": 0.0})
        amount = float(row["amount"] or 0.0)
        if amount > 0:
            entry["inflow"] += amount
        elif amount < 0:
            entry["outflow"] += -amount
            merchant = row["payee"] or row["description"] or "Unknown"
            merchant_totals[merchant] += -amount
        entry["net"] += amount

    _, _, splits = _load_converted_splits(session, start_date=start_date, exclude_unbudgetable=True)
    category_totals: dict[str, float] = defaultdict(float)
    for row in splits:
        amount = float(row["amount"] or 0.0)
        if amount >= 0:
            continue
        category_name = row["category_name"] or "Uncategorized"
        category_totals[category_name] += -amount

    monthly = [
        {"month": month, "currency": base_currency, **values}
        for month, values in sorted(monthly_map.items())
    ]
    avg_spend = 0.0
    if monthly:
        avg_spend = sum(r["outflow"] or 0 for r in monthly) / len(monthly)

    return {
        "start_date": start_date,
        "base_currency": base_currency,
        "monthly": monthly,
        "categories": [
            {"category": category, "spend": spend, "currency": base_currency}
            for category, spend in sorted(category_totals.items(), key=lambda item: item[1], reverse=True)[:12]
        ],
        "merchants": [
            {"merchant": merchant, "spend": spend, "currency": base_currency}
            for merchant, spend in sorted(merchant_totals.items(), key=lambda item: item[1], reverse=True)[:12]
        ],
        "avg_spend": avg_spend,
    }


def _budget_matrix_snapshot(
    session,
    year: int,
    overrides: dict[tuple[str, str], float] | None = None,
    clear_keys: set[tuple[str, str]] | None = None,
) -> dict:
    months = [f"{year}-{month:02d}" for month in range(1, 13)]
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    base_currency, _, actual_map, _ = _bucket_budget_actuals(session, start_date, end_date)
    _, _, subcategory_actual_map, subcategory_info_map = _subcategory_budget_actuals(session, start_date, end_date)
    merged_subcategory_info_map = _defined_subcategory_info(session)
    merged_subcategory_info_map.update(subcategory_info_map)
    budget_map = _bucket_totals_for_year(session, year)
    overrides = overrides or {}
    clear_keys = clear_keys or set()
    for key in clear_keys:
        budget_map.pop(key, None)
    for key, amount in overrides.items():
        existing = dict(budget_map.get(key, {"amount": 0.0, "rollover": 0.0, "target_id": None}))
        existing["amount"] = float(amount or 0.0)
        budget_map[key] = existing
    current_month = _current_month_label()
    category_rows = []
    totals_income = {month: 0.0 for month in months}
    totals_expense = {month: 0.0 for month in months}
    totals_planned_income = {month: 0.0 for month in months}
    totals_planned_expense = {month: 0.0 for month in months}
    totals_effective_income = {month: 0.0 for month in months}
    totals_effective_expense = {month: 0.0 for month in months}
    totals_remaining = {month: 0.0 for month in months}
    totals_cumulative_cashflow = {month: 0.0 for month in months}
    month_meta: dict[str, dict[str, Any]] = {}

    for bucket in BUDGET_BUCKETS:
        income_by_month = {}
        expense_by_month = {}
        budget_by_month = {}
        budget_entered_by_month = {}
        target_id_by_month = {}
        effective_budget_by_month = {}
        editable_by_month = {}
        rollover_by_month = {}
        total_income = 0.0
        total_expense = 0.0
        for month in months:
            actual = actual_map.get((bucket.key, month), {"income": 0.0, "expense": 0.0})
            income = actual["income"]
            expense = actual["expense"]
            income_by_month[month] = income
            expense_by_month[month] = expense
            total_income += income
            total_expense += expense
            totals_income[month] += income
            totals_expense[month] += expense

            budget = budget_map.get((bucket.key, month), {"amount": 0.0, "rollover": 0.0, "target_id": None})
            has_plan = (bucket.key, month) in budget_map
            planned_amount = float(budget.get("amount") or 0.0)
            actual_amount = income if bucket.type == "income" else expense
            effective_amount = _effective_budget_amount(
                month,
                bucket.type,
                planned_amount,
                has_plan,
                actual_amount,
                current_month=current_month,
            )
            budget_by_month[month] = budget["amount"]
            budget_entered_by_month[month] = has_plan
            target_id_by_month[month] = budget.get("target_id")
            effective_budget_by_month[month] = effective_amount
            editable_by_month[month] = _month_state(month, current_month) != "past"
            rollover_by_month[month] = budget["rollover"]
            if bucket.type == "income":
                totals_planned_income[month] += planned_amount
                totals_effective_income[month] += effective_amount
            else:
                totals_planned_expense[month] += planned_amount
                totals_effective_expense[month] += effective_amount

        subcategory_rows = []
        bucket_subcategories = [
            info
            for (subcategory_bucket_key, _), info in merged_subcategory_info_map.items()
            if subcategory_bucket_key == bucket.key
        ]
        bucket_subcategories.sort(key=lambda item: (1 if item.get("is_unassigned") else 0, (item.get("name") or "").lower()))
        for info in bucket_subcategories:
            income_by_month_sub = {}
            expense_by_month_sub = {}
            total_income_sub = 0.0
            total_expense_sub = 0.0
            for month in months:
                actual = subcategory_actual_map.get(
                    (bucket.key, str(info["id"]), month),
                    {"income": 0.0, "expense": 0.0},
                )
                income_value = float(actual["income"] or 0.0)
                expense_value = float(actual["expense"] or 0.0)
                income_by_month_sub[month] = income_value
                expense_by_month_sub[month] = expense_value
                total_income_sub += income_value
                total_expense_sub += expense_value
            subcategory_rows.append(
                {
                    "id": f"{bucket.key}:{info['id']}",
                    "subcategory_id": info.get("subcategory_id"),
                    "name": info.get("name"),
                    "type": bucket.type,
                    "is_unassigned": bool(info.get("is_unassigned")),
                    "income": income_by_month_sub,
                    "expense": expense_by_month_sub,
                    "total_income": total_income_sub,
                    "total_expense": total_expense_sub,
                }
            )

        category_rows.append(
            {
                "id": bucket.key,
                "name": bucket.name,
                "type": bucket.type,
                "budget": budget_by_month,
                "budget_entered": budget_entered_by_month,
                "budget_target_id": target_id_by_month,
                "effective_budget": effective_budget_by_month,
                "editable": editable_by_month,
                "rollover": rollover_by_month,
                "income": income_by_month,
                "expense": expense_by_month,
                "total_income": total_income,
                "total_expense": total_expense,
                "subcategories": subcategory_rows,
            }
        )

    opening_liquid_balance = _liquid_balance_before_date(session, f"{year:04d}-01-01")
    running_cashflow = opening_liquid_balance
    for month in months:
        remaining = totals_effective_income[month] - totals_effective_expense[month]
        totals_remaining[month] = remaining
        running_cashflow += remaining
        totals_cumulative_cashflow[month] = running_cashflow
        month_meta[month] = {
            "state": _month_state(month, current_month),
            "editable": _month_state(month, current_month) != "past",
            "actual_income": totals_income[month],
            "actual_expense": totals_expense[month],
            "planned_income": totals_planned_income[month],
            "planned_expense": totals_planned_expense[month],
            "effective_income": totals_effective_income[month],
            "effective_expense": totals_effective_expense[month],
            "remaining_to_allocate": remaining,
            "cumulative_cashflow": running_cashflow,
            "supported": running_cashflow >= -BUDGET_CASH_TOLERANCE,
        }

    return {
        "year": year,
        "base_currency": base_currency,
        "current_month": current_month,
        "months": months,
        "month_meta": month_meta,
        "categories": category_rows,
        "totals": {
            "income": totals_income,
            "expense": totals_expense,
            "planned_income": totals_planned_income,
            "planned_expense": totals_planned_expense,
            "effective_income": totals_effective_income,
            "effective_expense": totals_effective_expense,
            "remaining": totals_remaining,
            "cumulative_cashflow": totals_cumulative_cashflow,
            "opening_liquid_balance": opening_liquid_balance,
        },
    }


def budget_matrix(session, year: int) -> dict:
    return _budget_matrix_snapshot(session, year)


def cashflow_forecast(session, months: int = 6, lookback: int = 6) -> dict:
    latest = _latest_txn_date(session)
    if not latest:
        return {
            "base_currency": get_base_currency(session),
            "actuals": [],
            "forecast": [],
            "avg_inflow": 0.0,
            "avg_outflow": 0.0,
            "avg_net": 0.0,
        }

    start_date = _month_start(latest, max(lookback - 1, 0))
    all_rows = cashflow_by_month(session)
    actuals = [row for row in all_rows if str(row.get("month")) >= start_date[:7]]
    base_currency = get_base_currency(session)
    averages: dict[str, dict[str, float]] = {base_currency: {"avg_inflow": 0.0, "avg_outflow": 0.0, "avg_net": 0.0}}
    forecast_rows: list[dict] = []
    actuals.sort(key=lambda r: str(r.get("month")))
    recent = actuals[-min(3, len(actuals)):] if actuals else []
    avg_inflow = sum(r["inflow"] or 0 for r in recent) / len(recent) if recent else 0.0
    avg_outflow = sum(r["outflow"] or 0 for r in recent) / len(recent) if recent else 0.0
    avg_net = avg_inflow - avg_outflow
    averages[base_currency] = {
        "avg_inflow": avg_inflow,
        "avg_outflow": avg_outflow,
        "avg_net": avg_net,
    }

    if actuals:
        last_month = actuals[-1]["month"]
        year, month = [int(part) for part in str(last_month).split("-")]
    else:
        dt = _parse_date(latest)
        year, month = dt.year, dt.month

    for _ in range(months):
        month += 1
        if month > 12:
            month = 1
            year += 1
        forecast_rows.append(
            {
                "month": f"{year:04d}-{month:02d}",
                "currency": base_currency,
                "inflow": avg_inflow,
                "outflow": avg_outflow,
                "net": avg_net,
            }
        )

    return {
        "base_currency": base_currency,
        "actuals": actuals,
        "forecast": forecast_rows,
        "avg_inflow": avg_inflow,
        "avg_outflow": avg_outflow,
        "avg_net": avg_net,
        "avg_by_currency": averages,
    }


def _latest_txn_date(session) -> str | None:
    row = session.execute(
        text(
            "SELECT MAX(date) AS max_date FROM transactions t WHERE "
            + _exclude_legacy_opening("t")
        )
    ).mappings().one()
    return row.get("max_date")


def _parse_date(value: str) -> datetime:
    if not value:
        return datetime.now()
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d")
        except ValueError:
            return datetime.now()


def _month_start(value: str, months_back: int) -> str:
    dt = _parse_date(value)
    year = dt.year
    month = dt.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}-01"
