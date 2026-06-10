from ..reports.service import BUDGET_CASH_TOLERANCE, _budget_matrix_snapshot, _month_state, budget_matrix, budget_status
from ..taxonomy.service import (
    BUDGET_BUCKETS,
    budget_bucket_key_for_category,
    get_budget_bucket,
    list_budget_buckets,
    require_budget_bucket,
)


def budget_matrix_snapshot(session, year: int, *, overrides=None, clear_keys=None) -> dict:
    return _budget_matrix_snapshot(session, year, overrides=overrides, clear_keys=clear_keys)


def month_state(month: str, current_month: str | None = None) -> str:
    return _month_state(month, current_month)

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
    "require_budget_bucket",
]
