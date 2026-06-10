from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy import text, select

from ...core.ledger_filters import is_legacy_opening as _shared_is_legacy_opening
from ..budgeting.reporting import BUDGET_CASH_TOLERANCE, budget_bucket_transactions, budget_matrix, budget_status
from ..connectors.models import PlaidAccount, UpAccount
from ..ledger.models import Account, Transaction, TransactionSplit
from ..taxonomy.models import Category, Subcategory
from ..timesheets.models import Project, TimeEntry
from ..taxonomy.service import FRIENDS_CATEGORY_NAME
from ..ledger.account_roles import account_cash_role, is_business_account
from ..fx.currency import convert_amount, get_recent_fortnightly_average_aud_per_usd
from ..settings.service import get_base_currency

BUDGET_CASH_ACCOUNT_TYPES = {"bank", "checking"}


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
