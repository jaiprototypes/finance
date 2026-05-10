from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass
class DebtSnapshot:
    debt_id: str
    name: str
    balance: float
    apr: float
    min_payment: float


def _monthly_rate(apr: float) -> float:
    return float(apr) / 12.0


def _sorted_debts(debts: list[DebtSnapshot], strategy: str) -> list[DebtSnapshot]:
    if strategy == "snowball":
        return sorted(debts, key=lambda d: (d.balance, -d.apr))
    return sorted(debts, key=lambda d: (-d.apr, d.balance))


def payoff_plan(
    debts: Iterable[DebtSnapshot | dict],
    strategy: str = "avalanche",
    extra_payment: float = 0.0,
    max_months: int = 600,
) -> dict:
    debts_list = []
    for d in debts:
        if isinstance(d, DebtSnapshot):
            debts_list.append(DebtSnapshot(**d.__dict__))
        else:
            debts_list.append(DebtSnapshot(**d))

    if not debts_list:
        return {"months": 0, "total_interest": 0.0, "schedule": []}

    schedule = []
    total_interest = 0.0

    for month in range(1, max_months + 1):
        remaining = [d for d in debts_list if d.balance > 0.01]
        if not remaining:
            break

        ordered = _sorted_debts(remaining, strategy)
        month_detail = {"month": month, "payments": {}, "interest": 0.0}

        for d in remaining:
            interest = d.balance * _monthly_rate(d.apr)
            d.balance += interest
            month_detail["interest"] += interest
            total_interest += interest

        for d in remaining:
            payment = min(d.min_payment, d.balance)
            d.balance -= payment
            month_detail["payments"][d.debt_id] = {
                "name": d.name,
                "payment": payment,
                "min_payment": d.min_payment,
                "extra_payment": 0.0,
            }

        extra_left = extra_payment
        for d in ordered:
            if extra_left <= 0:
                break
            if d.balance <= 0:
                continue
            pay = min(extra_left, d.balance)
            d.balance -= pay
            extra_left -= pay
            month_detail["payments"][d.debt_id]["payment"] += pay
            month_detail["payments"][d.debt_id]["extra_payment"] += pay

        schedule.append(month_detail)

    return {
        "months": len(schedule),
        "total_interest": round(total_interest, 2),
        "schedule": schedule,
    }

