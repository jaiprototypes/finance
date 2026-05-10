from shared.debt import DebtSnapshot, payoff_plan


def test_payoff_avalanche_reduces_balances():
    debts = [
        DebtSnapshot(debt_id="1", name="Card", balance=1000.0, apr=0.2, min_payment=50.0),
        DebtSnapshot(debt_id="2", name="Loan", balance=2000.0, apr=0.1, min_payment=40.0),
    ]
    result = payoff_plan(debts, strategy="avalanche", extra_payment=100.0, max_months=120)
    assert result["months"] > 0
    assert result["total_interest"] >= 0.0

