"""Saved plans and fresh actuals needed to project cash beyond a calendar-year boundary."""

from dataclasses import dataclass
from typing import Any

from ..taxonomy.service import BUDGET_BUCKETS, BudgetBucket


@dataclass(frozen=True)
class BudgetPlanningContext:
    """Expose unfulfilled-plan inputs without mixing them into bank balances."""

    months: list[str]
    current_month: str
    budgets: dict[tuple[str, str], dict[str, Any]]
    actuals: dict[tuple[str, str], dict[str, float]]
    pending: dict[tuple[str, str], dict[str, float]]

    def report(self) -> dict[str, Any]:
        """Include current actuals and saved-plan months without inventing zero targets."""
        return {
            "months": self.months,
            "month_meta": {
                month: {
                    "state": "current" if month == self.current_month else "future",
                    "editable": True,
                }
                for month in self.months
            },
            "categories": [self._category(bucket) for bucket in BUDGET_BUCKETS] if self.months else [],
        }

    def _category(self, bucket: BudgetBucket) -> dict[str, Any]:
        """Use the same category maps as the selected-year matrix for shared projection logic."""
        return {
            "id": bucket.key,
            "name": bucket.name,
            "type": bucket.type,
            "cash_neutral": bucket.key == "savings",
            "budget": {
                month: float(self.budgets.get((bucket.key, month), {}).get("amount") or 0.0)
                for month in self.months
            },
            "budget_entered": {month: (bucket.key, month) in self.budgets for month in self.months},
            "budget_target_id": {
                month: self.budgets.get((bucket.key, month), {}).get("target_id") for month in self.months
            },
            "due_date": {
                month: self.budgets.get((bucket.key, month), {}).get("due_date")
                for month in self.months
            },
            "future_cost": {
                month: bool(self.budgets.get((bucket.key, month), {}).get("future_cost", False))
                for month in self.months
            },
            "income": self._amounts(self.actuals, bucket.key, "income"),
            "expense": self._amounts(self.actuals, bucket.key, "expense"),
            "pending_income": self._amounts(self.pending, bucket.key, "income"),
            "pending_expense": self._amounts(self.pending, bucket.key, "expense"),
        }

    def _amounts(self, source: dict, bucket_key: str, role: str) -> dict[str, float]:
        """Preserve signed refunds and authoritative pending reservations per month."""
        return {
            month: float(source.get((bucket_key, month), {}).get(role) or 0.0)
            for month in self.months
        }
