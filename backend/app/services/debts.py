from shared.debt import DebtSnapshot, payoff_plan


def build_payoff_plan(debts: list[dict], strategy: str, extra_payment: float) -> dict:
    snapshots = [
        DebtSnapshot(
            debt_id=str(d["debt_id"]),
            name=d["name"],
            balance=float(d["balance"]),
            apr=float(d["apr"]),
            min_payment=float(d["min_payment"]),
        )
        for d in debts
    ]
    return payoff_plan(snapshots, strategy=strategy, extra_payment=extra_payment)

