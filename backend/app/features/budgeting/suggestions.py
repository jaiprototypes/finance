"""Completed, covered spending history for reviewable budget suggestions."""

from datetime import date

from ..taxonomy.service import BUDGET_BUCKETS


class BudgetSuggestionHistory:
    """Keep incomplete feeds and the current partial month out of spending baselines."""

    def __init__(self, current_month: str, *, enabled: bool, count: int = 3):
        year, month = map(int, current_month.split("-"))
        current = year * 12 + month - 1
        self.months = [f"{index // 12:04d}-{index % 12 + 1:02d}"
                       for index in range(current - count, current)] if enabled else []

    def report(self, actuals: dict, cash_months: dict) -> list[dict]:
        """A known zero month is usable; a month without complete bank coverage is not."""
        result = []
        for month in self.months:
            cash = cash_months.get(month, {})
            covered = self._is_covered(month, cash)
            expenses = {
                bucket.key: float(actuals.get((bucket.key, month), {}).get("expense") or 0)
                for bucket in BUDGET_BUCKETS if bucket.type != "income"
            } if covered else {}
            result.append({"month": month, "covered": covered, "expenses": expenses})
        return result

    @staticmethod
    def _is_covered(month: str, cash: dict) -> bool:
        """A carried cash snapshot cannot establish spending after its observation date."""
        if cash.get("opening") is None or cash.get("closing") is None:
            return False
        try:
            observed = date.fromisoformat(str(cash.get("as_of") or "")[:10])
        except ValueError:
            return False
        # The cash report uses the earliest account observation; every feed must reach month end.
        return month < observed.strftime("%Y-%m")
