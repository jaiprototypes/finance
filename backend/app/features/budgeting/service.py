from sqlalchemy import select
from sqlalchemy.orm import Session

from ..fx.currency import convert_amount, normalize_currency_code
from .reporting import (
    BUDGET_CASH_TOLERANCE,
    budget_matrix,
    budget_matrix_snapshot,
    budget_status,
    month_state,
)
from .models import BudgetBucketTarget, BudgetCategoryTarget
from ..taxonomy.service import (
    BUDGET_BUCKETS,
    budget_bucket_key_for_category,
    get_budget_bucket,
    list_budget_buckets,
    require_budget_bucket,
)


def rebase_budget_targets(
    session: Session,
    source_currency: str,
    target_currency: str,
    aud_per_usd: float | None,
) -> int:
    source = normalize_currency_code(source_currency)
    target = normalize_currency_code(target_currency)
    if source == target:
        return 0

    changed = 0
    # Budget target amounts are persisted in the app base currency.
    for model in (BudgetCategoryTarget, BudgetBucketTarget):
        rows = session.execute(select(model)).scalars().all()
        for row in rows:
            row.amount = round(convert_amount(row.amount or 0.0, source, target, aud_per_usd), 2)
            row.rollover_amount = round(convert_amount(row.rollover_amount or 0.0, source, target, aud_per_usd), 2)
            changed += 1
    return changed


__all__ = [
    "BUDGET_BUCKETS",
    "BUDGET_CASH_TOLERANCE",
    "budget_bucket_key_for_category",
    "budget_matrix",
    "budget_matrix_snapshot",
    "budget_status",
    "get_budget_bucket",
    "list_budget_buckets",
    "month_state",
    "rebase_budget_targets",
    "require_budget_bucket",
]
