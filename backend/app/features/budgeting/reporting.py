from datetime import datetime
from typing import Any

from sqlalchemy import select, text

from ...core.currency import get_base_currency
from ...core.ledger_filters import is_legacy_opening as _shared_is_legacy_opening
from ..fx.currency import convert_amount, get_recent_fortnightly_average_aud_per_usd
from ..ledger.account_roles import is_business_account
from ..ledger.models import Account, Transaction, TransactionSplit
from ..ledger.bank_activity import BankActivityPolicy
from ..ledger.cashflow import LedgerCashflowService
from ..ledger.payment_reversals import load_reversed_payment_ids
from ..taxonomy.models import Category, Subcategory
from ..taxonomy.service import (
    BUDGET_BUCKETS,
    budget_bucket_key_for_category,
    get_budget_bucket,
    require_budget_bucket,
)
from .models import BudgetBucketTarget, BudgetCategoryTarget, BudgetMonth
from .planning import BudgetPlanningContext
from .suggestions import BudgetSuggestionHistory
from .savings import BudgetSavingsActivity

# Budget projections live here so reports can delegate without owning budget state.


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
        if "transfer" in lowered:
            transfer_ids.add(txn_id)
    return transfer_ids


def _load_budget_reversal_transaction_ids(session) -> set[int]:
    """Use the shared matcher for confirmed unpaid-payment returns."""
    return load_reversed_payment_ids(session)


def _conversion_context(session) -> tuple[str, dict[str, Any]]:
    return get_base_currency(session), get_recent_fortnightly_average_aud_per_usd(session)


def _convert_value(value: float, currency: str | None, base_currency: str, fx_summary: dict[str, Any]) -> float:
    return convert_amount(value, currency or base_currency, base_currency, fx_summary.get("aud_per_usd"))


def _budget_role_for_bucket(bucket_key: str | None) -> str:
    bucket = get_budget_bucket(bucket_key)
    return bucket.type if bucket else "expense"


def _budget_actual_amounts(bucket_key: str, inflow: float, outflow: float) -> dict[str, float]:
    """Keep refunds and income reversals signed at every level of the report."""
    net = float(inflow or 0.0) - float(outflow or 0.0)
    if _budget_role_for_bucket(bucket_key) == "income":
        return {"income": net, "expense": 0.0}
    return {"income": 0.0, "expense": -net}


def _budget_signed_amount(row: dict) -> float:
    """Savings deposits allocate money while their native bank credit stays positive."""
    return float(row["amount"] or 0.0) * float(row.get("budget_sign", 1))


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
    planned_amount: float,
    has_plan: bool,
    actual_amount: float,
    current_month: str | None = None,
) -> float:
    """Project only the part of an explicit target not already recorded."""
    actual = float(actual_amount or 0.0)
    state = _month_state(month, current_month)
    if state == "past":
        return actual
    if has_plan:
        return actual + max(float(planned_amount or 0.0) - actual, 0.0)
    return actual


def _load_converted_splits(
    session,
    start_date: str | None = None,
    end_date: str | None = None,
    exclude_unbudgetable: bool = False,
    include_pending: bool = False,
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    base_currency, fx_summary = _conversion_context(session)
    bank_activity = BankActivityPolicy(session)
    excluded_ids = _load_budget_reversal_transaction_ids(session)
    if not include_pending:
        excluded_ids |= bank_activity.pending_ids
    if exclude_unbudgetable:
        excluded_ids |= _load_unbudgetable_transaction_ids(session)
    savings_rows = []
    if exclude_unbudgetable:
        savings = BudgetSavingsActivity(session)
        savings_rows = savings.rows(base_currency, fx_summary, start_date, end_date)
        # A proven savings move is represented once even when a stale label says spending.
        excluded_ids |= savings.transaction_ids
    query = (
        select(TransactionSplit, Transaction, Category.name, Subcategory.name, Account.name)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(Category, Category.id == TransactionSplit.category_id, isouter=True)
        .join(Subcategory, Subcategory.id == TransactionSplit.subcategory_id, isouter=True)
    )
    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
    rows = session.execute(query).all()
    split_amounts = bank_activity.split_amounts([row[0] for row in rows])
    results: list[dict[str, Any]] = []
    for split, txn, category_name, subcategory_name, account_name in rows:
        if txn.id in excluded_ids:
            continue
        if _is_legacy_opening(txn.description, txn.notes, txn.payee):
            continue
        split_currency = split.currency or txn.currency or base_currency
        native_amount = split_amounts[split.id]
        amount_base = _convert_value(native_amount, split_currency, base_currency, fx_summary)
        results.append(
            {
                "split_id": int(split.id),
                "transaction_id": txn.id,
                "account_name": account_name,
                "description": txn.description,
                "payee": txn.payee,
                "category_id": split.category_id,
                "category_name": category_name,
                "subcategory_id": split.subcategory_id,
                "subcategory_name": subcategory_name,
                "date": str(txn.date),
                "month": str(txn.date)[:7],
                "currency": base_currency,
                "native_currency": split_currency,
                "native_amount": native_amount,
                "native_gross_amount": float(split.amount or 0.0),
                "native_cashback": native_amount - float(split.amount or 0.0),
                "pending": txn.id in bank_activity.pending_ids,
                "amount": amount_base,
            }
        )
    results.extend(row for row in savings_rows if include_pending or not row["pending"])
    return base_currency, fx_summary, results


def _subcategory_budget_actuals(
    session,
    start_date: str,
    end_date: str,
    converted=None,
) -> tuple[str, dict[str, Any], dict[tuple[str, str, str], dict[str, float]], dict[tuple[str, str], dict[str, Any]]]:
    base_currency, fx_summary, rows = converted if converted is not None else _load_converted_splits(
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
        subcategory_key = row.get("subcategory_key") or (str(subcategory_id) if subcategory_id is not None else "unassigned")
        info_map[(bucket_key, subcategory_key)] = {
            "id": subcategory_key,
            "subcategory_id": subcategory_id,
            "name": row.get("subcategory_name") or "Unassigned",
            "is_unassigned": subcategory_id is None and not row.get("subcategory_key"),
            "allocation_kind": row.get("allocation_kind"),
            "read_only": bool(row.get("read_only")),
        }
        entry = raw_map.setdefault(
            (bucket_key, subcategory_key, month),
            {"positive_amount": 0.0, "negative_amount": 0.0},
        )
        amount = _budget_signed_amount(row)
        if amount > 0:
            entry["positive_amount"] += amount
        elif amount < 0:
            entry["negative_amount"] += -amount
    actual_map: dict[tuple[str, str, str], dict[str, float]] = {}
    for key, entry in raw_map.items():
        actual_map[key] = _budget_actual_amounts(key[0], entry["positive_amount"], entry["negative_amount"])
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
    session, start_date: str, end_date: str, converted=None,
) -> tuple[str, dict[str, Any], dict[tuple[str, str], dict[str, float]], set[str]]:
    base_currency, fx_summary, rows = converted if converted is not None else _load_converted_splits(
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
        amount = _budget_signed_amount(row)
        if amount > 0:
            entry["positive_amount"] += amount
        elif amount < 0:
            entry["negative_amount"] += -amount
        bucket_keys.add(bucket_key)
    actual_map: dict[tuple[str, str], dict[str, float]] = {}
    for key, entry in raw_map.items():
        actual_map[key] = _budget_actual_amounts(key[0], entry["positive_amount"], entry["negative_amount"])
    return base_currency, fx_summary, actual_map, bucket_keys


def budget_bucket_transactions(
    session,
    month: str,
    bucket_key: str,
    *,
    subcategory_id: int | None = None,
    unassigned: bool = False,
    allocation_kind: str | None = None,
) -> dict[str, Any]:
    bucket = require_budget_bucket(bucket_key)
    if len(month or "") != 7:
        raise ValueError("Month must be in YYYY-MM format")
    start_date = f"{month}-01"
    end_date = f"{month}-31"
    kinds = {"savings_roundups", "savings_deposits", "savings_withdrawals"}
    if allocation_kind is not None and (bucket.key != "savings" or allocation_kind not in kinds):
        raise ValueError("Unknown savings activity kind")
    # The matrix and its detail panel share one source and one allocation policy.
    base_currency, _, rows = _load_converted_splits(
        session, start_date, end_date, exclude_unbudgetable=True,
    )
    transactions: list[dict[str, Any]] = []
    positive_amount = 0.0
    negative_amount = 0.0
    for row in rows:
        if budget_bucket_key_for_category(row["category_name"]) != bucket.key:
            continue
        if unassigned and (row["subcategory_id"] is not None or row.get("subcategory_key")):
            continue
        if subcategory_id is not None and int(row["subcategory_id"] or 0) != int(subcategory_id):
            continue
        if allocation_kind is not None and row.get("allocation_kind") != allocation_kind:
            continue
        amount = _budget_signed_amount(row)
        effect_on_actual = amount if bucket.type == "income" else -amount
        positive_amount += max(amount, 0.0)
        negative_amount += max(-amount, 0.0)
        transactions.append({**row, "effect_on_actual": effect_on_actual})
    transactions.sort(
        key=lambda row: (
            str(row.get("date") or ""),
            abs(float(row.get("effect_on_actual") or 0.0)),
            int(row.get("transaction_id") or 0),
        ),
        reverse=True,
    )
    actuals = _budget_actual_amounts(bucket.key, positive_amount, negative_amount)
    actual_total = actuals[bucket.type]
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
                "due_date": row.due_date,
                "future_cost": bool(row.future_cost),
            }
            for row in rows
        }
    return _legacy_bucket_totals_for_month(session, budget_month_id)


def _bucket_totals_for_period(
    session, start_month: str, end_month: str,
) -> dict[tuple[str, str], dict[str, float | int | None]]:
    """Read saved bucket targets and legacy fallback targets in one bounded period."""
    months = session.execute(
        select(BudgetMonth.id, BudgetMonth.month).where(
            BudgetMonth.month >= start_month, BudgetMonth.month <= end_month,
        )
    ).all()
    month_lookup = {str(month): int(month_id) for month_id, month in months}
    bucket_rows = session.execute(
        text(
            """
            SELECT bbt.budget_bucket AS bucket_key,
                   bm.month AS month,
                   bbt.id AS target_id,
                   bbt.amount AS amount,
                   bbt.rollover_amount AS rollover_amount,
                   bbt.due_date AS due_date,
                   bbt.future_cost AS future_cost
            FROM budget_bucket_target bbt
            JOIN budget_month bm ON bm.id = bbt.budget_month_id
            WHERE bm.month >= :start_month AND bm.month <= :end_month
            """
        ),
        {"start_month": start_month, "end_month": end_month},
    ).mappings().all()
    budget_map: dict[tuple[str, str], dict[str, float | int | None]] = {}
    months_with_bucket_targets = {str(row["month"]) for row in bucket_rows}
    for row in bucket_rows:
        budget_map[(str(row["bucket_key"]), str(row["month"]))] = {
            "target_id": int(row["target_id"]),
            "due_date": row["due_date"],
            "future_cost": bool(row["future_cost"]),
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
        if target <= 0 and spent == 0:
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


def _budget_matrix_snapshot(
    session,
    year: int,
    overrides: dict[tuple[str, str], float] | None = None,
    clear_keys: set[tuple[str, str]] | None = None,
) -> dict:
    months = [f"{year}-{month:02d}" for month in range(1, 13)]
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    current_month = _current_month_label()
    suggestion_history = BudgetSuggestionHistory(current_month, enabled=months[-1] >= current_month)
    # Future-year cash must also honor remaining saved plans before that year.
    budget_start = min(months[0], current_month)
    budget_map = _bucket_totals_for_period(session, budget_start, months[-1])
    for key in clear_keys or set():
        budget_map.pop(key, None)
    for key, amount in (overrides or {}).items():
        existing = dict(budget_map.get(key, {"amount": 0.0, "rollover": 0.0, "target_id": None}))
        existing["amount"] = float(amount or 0.0)
        budget_map[key] = existing
    prior_plan_months = sorted({month for _, month in budget_map if current_month <= month < months[0]})
    source_start = f"{prior_plan_months[0]}-01" if prior_plan_months else start_date
    if suggestion_history.months:
        source_start = min(source_start, f"{suggestion_history.months[0]}-01")
    base_currency, fx_summary, converted_rows = _load_converted_splits(
        session, source_start, end_date, exclude_unbudgetable=True, include_pending=True,
    )
    # Unsaved plans from an earlier open year need fresh actuals and holds as months advance.
    prior_plan_months = sorted(set(prior_plan_months) | {
        row["month"] for row in converted_rows if current_month <= row["month"] < months[0]
    } | ({current_month} if current_month < months[0] else set()))
    # One source read supplies posted actuals and reservations without double counting.
    actual_context = (base_currency, fx_summary, [row for row in converted_rows if not row["pending"]])
    pending_context = (base_currency, fx_summary, [row for row in converted_rows if row["pending"]])
    _, _, actual_map, _ = _bucket_budget_actuals(session, start_date, end_date, actual_context)
    _, _, pending_map, _ = _bucket_budget_actuals(session, start_date, end_date, pending_context)
    selected_actual_context = (
        base_currency, fx_summary, [row for row in actual_context[2] if row["month"] >= months[0]],
    )
    _, _, subcategory_actual_map, subcategory_info_map = _subcategory_budget_actuals(
        session, start_date, end_date, selected_actual_context,
    )
    merged_subcategory_info_map = _defined_subcategory_info(session)
    merged_subcategory_info_map.update(subcategory_info_map)
    category_rows = []
    totals_income = {month: 0.0 for month in months}
    totals_expense = {month: 0.0 for month in months}
    totals_planned_income = {month: 0.0 for month in months}
    totals_planned_expense = {month: 0.0 for month in months}
    totals_effective_income = {month: 0.0 for month in months}
    totals_effective_expense = {month: 0.0 for month in months}
    totals_remaining = {month: 0.0 for month in months}
    totals_cumulative_cashflow = {month: 0.0 for month in months}
    totals_projected_remaining = {month: 0.0 for month in months}
    totals_projected_cashflow = {month: 0.0 for month in months}
    month_meta: dict[str, dict[str, Any]] = {}

    for bucket in BUDGET_BUCKETS:
        income_by_month = {}
        expense_by_month = {}
        pending_income_by_month = {}
        pending_expense_by_month = {}
        budget_by_month = {}
        budget_entered_by_month = {}
        target_id_by_month = {}
        due_date_by_month = {}
        future_cost_by_month = {}
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
            pending = pending_map.get((bucket.key, month), {"income": 0.0, "expense": 0.0})
            pending_income_by_month[month] = pending["income"]
            pending_expense_by_month[month] = pending["expense"]
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
                planned_amount,
                has_plan,
                actual_amount,
                current_month=current_month,
            )
            budget_by_month[month] = budget["amount"]
            budget_entered_by_month[month] = has_plan
            target_id_by_month[month] = budget.get("target_id")
            due_date_by_month[month] = budget.get("due_date")
            future_cost_by_month[month] = bool(budget.get("future_cost", False))
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
                    "allocation_kind": info.get("allocation_kind"),
                    "read_only": bool(info.get("read_only")),
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
                "cash_neutral": bucket.key == "savings",
                "budget": budget_by_month,
                "budget_entered": budget_entered_by_month,
                "budget_target_id": target_id_by_month,
                "due_date": due_date_by_month,
                "future_cost": future_cost_by_month,
                "effective_budget": effective_budget_by_month,
                "editable": editable_by_month,
                "rollover": rollover_by_month,
                "income": income_by_month,
                "expense": expense_by_month,
                "total_income": total_income,
                "total_expense": total_expense,
                "pending_income": pending_income_by_month,
                "pending_expense": pending_expense_by_month,
                "subcategories": subcategory_rows,
            }
        )

    # Incomplete history outside the selected period never becomes a carried deficit.
    running_cashflow = 0.0
    running_projected_cashflow = 0.0
    for month in months:
        remaining = totals_income[month] - totals_expense[month]
        projected_remaining = totals_effective_income[month] - totals_effective_expense[month]
        totals_remaining[month] = remaining
        totals_projected_remaining[month] = projected_remaining
        running_cashflow += remaining
        running_projected_cashflow += projected_remaining
        totals_cumulative_cashflow[month] = running_cashflow
        totals_projected_cashflow[month] = running_projected_cashflow
        month_meta[month] = {
            "state": _month_state(month, current_month),
            "editable": _month_state(month, current_month) != "past",
            "actual_income": totals_income[month],
            "actual_expense": totals_expense[month],
            "planned_income": totals_planned_income[month],
            "planned_expense": totals_planned_expense[month],
            "effective_income": totals_effective_income[month],
            "effective_expense": totals_effective_expense[month],
            "actual_net": remaining,
            "projected_net": projected_remaining,
            "remaining_to_allocate": remaining,
            "cumulative_cashflow": running_cashflow,
            "projected_cumulative_cashflow": running_projected_cashflow,
        }

    # One account reconstruction supplies both selected balances and advisory history coverage.
    cash_flow = LedgerCashflowService(
        session, base_currency=base_currency, aud_per_usd=fx_summary["aud_per_usd"],
    ).report(sorted(set(months) | set(suggestion_history.months)))
    history = suggestion_history.report(actual_map, cash_flow["months"])
    cash_flow["months"] = {month: cash_flow["months"][month] for month in months}

    return {
        "year": year,
        "base_currency": base_currency,
        "cashflow_basis": "selected_period_budget_net",
        "period_start": start_date,
        "period_end": end_date,
        "current_month": current_month,
        "months": months,
        "month_meta": month_meta,
        "prior_plan_context": BudgetPlanningContext(
            prior_plan_months, current_month, budget_map, actual_map, pending_map,
        ).report(),
        "suggestion_history": history,
        "cash_flow": cash_flow,
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
            "projected_remaining": totals_projected_remaining,
            "projected_cumulative_cashflow": totals_projected_cashflow,
        },
    }


def budget_matrix(session, year: int) -> dict:
    return _budget_matrix_snapshot(session, year)


__all__ = [
    "budget_bucket_transactions",
    "budget_matrix",
    "budget_matrix_snapshot",
    "budget_status",
    "month_state",
]


def budget_matrix_snapshot(session, year: int, *, overrides=None, clear_keys=None) -> dict:
    return _budget_matrix_snapshot(session, year, overrides=overrides, clear_keys=clear_keys)


def month_state(month: str, current_month: str | None = None) -> str:
    return _month_state(month, current_month)
