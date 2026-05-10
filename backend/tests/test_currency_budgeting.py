from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from backend.app.api import budgets as budgets_api
from backend.app.api import settings as settings_api
from backend.app.models import (
    Account,
    BudgetBucketTarget,
    BudgetCategoryTarget,
    BudgetMonth,
    Category,
    FXRate,
    PlaidAccount,
    PlaidItem,
    Subcategory,
    Transaction,
    TransactionSplit,
    UpAccount,
)
from backend.app.schemas import BudgetBucketTargetCreate, SettingsUpdate
from backend.app.services import reports
from backend.app.services.currency import (
    FX_STALE_DAYS,
    get_aud_per_usd_for_date,
    get_recent_fortnightly_average_aud_per_usd,
)
from backend.app.services.settings import get_setting
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _shift_month_label(offset: int) -> str:
    reference = datetime.now(tz=timezone.utc)
    year = reference.year
    month = reference.month + offset
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return f"{year:04d}-{month:02d}"


def _seed_fx_rates(session, values: list[float], end_date=None) -> None:
    end_date = end_date or datetime.now(tz=timezone.utc).date()
    start_date = end_date - timedelta(days=len(values) - 1)
    for offset, value in enumerate(values):
        day = start_date + timedelta(days=offset)
        session.add(
            FXRate(
                date=day.isoformat(),
                aud_per_usd=float(value),
                source="test",
                created_at=_now_str(),
            )
        )
    session.commit()


def _make_account(session, currency: str = "USD") -> Account:
    account = Account(
        name=f"{currency} Account",
        type="checking",
        currency=currency,
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.flush()
    return account


def _make_category(session, name: str) -> Category:
    category = Category(
        name=name,
        personal_allowed=1,
        business_allowed=1,
        tax_code=None,
        is_active=1,
    )
    session.add(category)
    session.flush()
    return category


def _make_subcategory(session, category_id: int, name: str) -> Subcategory:
    subcategory = Subcategory(
        category_id=category_id,
        name=name,
        normalized_name=name.strip().lower(),
        is_active=1,
    )
    session.add(subcategory)
    session.flush()
    return subcategory


def _make_transaction(
    session,
    account_id: int,
    date: str,
    amount: float,
    currency: str,
    description: str,
    payee: str | None = None,
    notes: str | None = None,
) -> Transaction:
    txn = Transaction(
        account_id=account_id,
        date=date,
        description=description,
        amount=amount,
        currency=currency,
        payee=payee,
        notes=notes,
        classification="Personal",
        reconciliation_state="imported",
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(txn)
    session.flush()
    return txn


def test_recent_fortnightly_average_uses_latest_window():
    session = make_session()
    values = [1.30 + 0.01 * idx for idx in range(20)]
    _seed_fx_rates(session, values)

    summary = get_recent_fortnightly_average_aud_per_usd(session)

    assert summary["observations"] == 14
    assert summary["window_days"] == 14
    assert summary["aud_per_usd"] == pytest.approx(sum(values[-14:]) / 14, rel=1e-9)


def test_recent_fortnightly_average_rejects_stale_rates():
    session = make_session()
    stale_end = datetime.now(tz=timezone.utc).date() - timedelta(days=FX_STALE_DAYS + 2)
    _seed_fx_rates(session, [1.52, 1.53, 1.54], end_date=stale_end)

    with pytest.raises(ValueError, match="FX rates are stale"):
        get_recent_fortnightly_average_aud_per_usd(session)


def test_historical_fx_lookup_uses_exact_or_previous_rate():
    session = make_session()
    _seed_fx_rates(
        session,
        [1.48, 1.49, 1.5],
        end_date=datetime(2026, 3, 7, tzinfo=timezone.utc).date(),
    )

    exact = get_aud_per_usd_for_date(session, "2026-03-07")
    previous = get_aud_per_usd_for_date(session, "2026-03-08")

    assert exact["aud_per_usd"] == pytest.approx(1.5)
    assert exact["rate_date"] == "2026-03-07"
    assert exact["match_type"] == "exact"
    assert exact["gap_days"] == 0
    assert previous["aud_per_usd"] == pytest.approx(1.5)
    assert previous["rate_date"] == "2026-03-07"
    assert previous["match_type"] == "previous"
    assert previous["gap_days"] == 1


def test_base_currency_change_rebases_budget_targets():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    category = _make_category(session, "Groceries")
    month = BudgetMonth(month="2026-03", rollover_enabled=1, created_at=_now_str())
    session.add(month)
    session.flush()
    session.add(
        BudgetCategoryTarget(
            budget_month_id=month.id,
            category_id=category.id,
            amount=100.0,
            rollover_amount=25.0,
        )
    )
    session.add(
        BudgetBucketTarget(
            budget_month_id=month.id,
            budget_bucket="food",
            amount=40.0,
            rollover_amount=10.0,
        )
    )
    session.commit()

    settings_api.update_settings(SettingsUpdate(base_currency="AUD"), session)

    category_target = session.execute(select(BudgetCategoryTarget)).scalar_one()
    bucket_target = session.execute(select(BudgetBucketTarget)).scalar_one()
    assert category_target.amount == pytest.approx(150.0)
    assert category_target.rollover_amount == pytest.approx(37.5)
    assert bucket_target.amount == pytest.approx(60.0)
    assert bucket_target.rollover_amount == pytest.approx(15.0)
    assert get_setting(session, "base_currency") == "AUD"
    assert get_setting(session, "budget_base_currency") == "AUD"


def test_budget_status_keeps_transfer_like_rows_until_explicitly_classified():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = _make_account(session, currency="AUD")
    groceries = _make_category(session, "Groceries")
    month = BudgetMonth(month="2026-03", rollover_enabled=1, created_at=_now_str())
    session.add(month)
    session.flush()
    session.add(
        BudgetCategoryTarget(
            budget_month_id=month.id,
            category_id=groceries.id,
            amount=100.0,
            rollover_amount=0.0,
        )
    )
    session.flush()

    grocery_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=-45.0,
        currency="AUD",
        description="Corner Store",
        payee="Corner Store",
    )
    p2p_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-07",
        amount=-30.0,
        currency="AUD",
        description="VENMO *John Doe",
        payee="VENMO *John Doe",
        notes="venmo dinner split",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=grocery_txn.id,
                category_id=groceries.id,
                amount=-45.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=p2p_txn.id,
                category_id=groceries.id,
                amount=-30.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    result = reports.budget_status(session, month="2026-03")

    assert result["base_currency"] == "USD"
    assert result["total_spent"] == pytest.approx(50.0)
    assert result["targets"][0]["spent"] == pytest.approx(50.0)
    assert result["targets"][0]["remaining"] == pytest.approx(50.0)


def test_budget_matrix_only_counts_explicit_income_categories_as_income():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = _make_account(session, currency="AUD")
    food = _make_category(session, "Food")
    income = _make_category(session, "Income")
    savings = _make_category(session, "Savings")
    business = _make_category(session, "Business")

    food_spend = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-02",
        amount=-60.0,
        currency="AUD",
        description="Cafe Blue",
    )
    food_refund = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=10.0,
        currency="AUD",
        description="Cafe Blue refund",
    )
    wage = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-07",
        amount=100.0,
        currency="AUD",
        description="Employer wage",
    )
    savings_top_up = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-08",
        amount=30.0,
        currency="AUD",
        description="You Left Save Up 1000",
    )
    business_distribution = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-09",
        amount=45.0,
        currency="AUD",
        description="ETF dividend distribution",
    )
    income_reversal = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-10",
        amount=-30.0,
        currency="AUD",
        description="Income correction",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=food_spend.id,
                category_id=food.id,
                amount=-60.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=food_refund.id,
                category_id=food.id,
                amount=10.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=wage.id,
                category_id=income.id,
                amount=100.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=savings_top_up.id,
                category_id=savings.id,
                amount=30.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=business_distribution.id,
                category_id=business.id,
                amount=45.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=income_reversal.id,
                category_id=income.id,
                amount=-30.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)
    month = "2026-03"
    rows = {row["name"]: row for row in matrix["categories"]}

    assert rows["Food"]["type"] == "expense"
    assert rows["Food"]["income"][month] == pytest.approx(0.0)
    assert rows["Food"]["expense"][month] == pytest.approx(33.3333333333)
    assert rows["Savings"]["type"] == "expense"
    assert rows["Savings"]["income"][month] == pytest.approx(0.0)
    assert rows["Savings"]["expense"][month] == pytest.approx(0.0)
    assert rows["Income"]["type"] == "income"
    assert rows["Income"]["income"][month] == pytest.approx(66.6666666667)
    assert rows["Income"]["expense"][month] == pytest.approx(20.0)
    assert matrix["totals"]["income"][month] == pytest.approx(66.6666666667)
    assert matrix["totals"]["expense"][month] == pytest.approx(53.3333333333)


def test_direct_debit_dishonour_pairs_are_excluded_from_budget_actuals_and_cashflow():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = _make_account(session, currency="AUD")
    housing = _make_category(session, "Housing & Bills")

    charge = _make_transaction(
        session,
        account_id=account.id,
        date="2026-01-31",
        amount=-130.9,
        currency="AUD",
        description="Allianz",
        payee="Allianz",
    )
    dishonour = _make_transaction(
        session,
        account_id=account.id,
        date="2026-02-02",
        amount=130.9,
        currency="AUD",
        description="Direct Debit Dishonour",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=charge.id,
                category_id=housing.id,
                amount=-130.9,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=dishonour.id,
                category_id=housing.id,
                amount=130.9,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)
    cashflow = {row["month"]: row for row in reports.cashflow_by_month(session)}

    assert matrix["totals"]["expense"]["2026-01"] == pytest.approx(0.0)
    assert matrix["totals"]["expense"]["2026-02"] == pytest.approx(0.0)
    assert "2026-01" not in cashflow
    assert "2026-02" not in cashflow


def test_net_worth_excludes_inactive_and_empty_accounts_from_returned_accounts():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    usd_bank = _make_account(session, currency="USD")
    aud_savings = Account(
        name="Rainy Day",
        type="savings",
        currency="AUD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    inactive_duplicate = Account(
        name="Old Duplicate",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=0,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    empty_loan = Account(
        name="Unused Loan",
        type="loan",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add_all([aud_savings, inactive_duplicate, empty_loan])
    session.flush()
    _make_transaction(
        session,
        account_id=usd_bank.id,
        date="2026-03-09",
        amount=100.0,
        currency="USD",
        description="Opening cash",
    )
    _make_transaction(
        session,
        account_id=aud_savings.id,
        date="2026-03-09",
        amount=25.0,
        currency="AUD",
        description="Saved cash",
    )
    session.commit()

    result = reports.net_worth(session)
    names = {account["account_name"] for account in result["accounts"]}
    expected_total = 100.0 + (25.0 / 1.5 if result["base_currency"] == "USD" else 25.0 + 150.0)

    assert result["total"] == pytest.approx(expected_total)
    assert names == {usd_bank.name, aud_savings.name}


def test_net_worth_uses_provider_balances_for_checking_cash_and_excludes_savings():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    usd_bank = _make_account(session, currency="USD")
    aud_bank = _make_account(session, currency="AUD")
    business_bank = Account(
        name="Business Checking",
        type="checking",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    aud_savings = Account(
        name="Saver",
        type="savings",
        currency="AUD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add_all([business_bank, aud_savings])
    session.flush()
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="access-1",
            institution_id="ins_1",
            institution_name="Test Bank",
            status="active",
            cursor=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        PlaidAccount(
            item_id="item-1",
            plaid_account_id="plaid-account-1",
            account_id=usd_bank.id,
            name="USD Bank",
            official_name="USD Bank",
            type="depository",
            subtype="checking",
            mask="1234",
            currency="USD",
            current_balance=40.0,
            available_balance=35.0,
            balance_as_of="2026-03-12T01:00:00+00:00",
            is_active=1,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        UpAccount(
            up_account_id="up-account-1",
            account_id=aud_bank.id,
            name="AUD Bank",
            account_type="TRANSACTIONAL",
            ownership_type="INDIVIDUAL",
            currency="AUD",
            current_balance=90.0,
            available_balance=90.0,
            balance_as_of="2026-03-11T23:00:00+00:00",
            is_active=1,
            last_synced_at=_now_str(),
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    _make_transaction(
        session,
        account_id=usd_bank.id,
        date="2026-03-09",
        amount=100.0,
        currency="USD",
        description="Ledger cash",
    )
    _make_transaction(
        session,
        account_id=aud_savings.id,
        date="2026-03-09",
        amount=25.0,
        currency="AUD",
        description="Saved cash",
    )
    _make_transaction(
        session,
        account_id=business_bank.id,
        date="2026-03-09",
        amount=500.0,
        currency="USD",
        description="Business cash",
    )
    session.commit()

    result = reports.net_worth(session)

    assert result["checking_total"] == pytest.approx(95.0)
    assert result["personal_checking_total"] == pytest.approx(95.0)
    assert result["business_checking_total"] == pytest.approx(500.0)
    assert result["all_checking_total"] == pytest.approx(595.0)
    assert result["checking_account_count"] == 2
    assert result["business_checking_account_count"] == 1
    assert result["all_checking_account_count"] == 3
    assert result["checking_provider_account_count"] == 2
    assert result["business_checking_provider_account_count"] == 0
    assert result["all_checking_provider_account_count"] == 2
    assert result["checking_ledger_fallback_count"] == 0
    assert result["business_checking_ledger_fallback_count"] == 1
    assert result["all_checking_ledger_fallback_count"] == 1
    assert result["checking_as_of"] == "2026-03-11T23:00:00+00:00"

    rows = {row["account_name"]: row for row in result["accounts"]}
    assert rows[usd_bank.name]["display_balance"] == pytest.approx(35.0)
    assert rows[usd_bank.name]["balance_source"] == "plaid"
    assert rows[aud_bank.name]["display_balance"] == pytest.approx(90.0)
    assert rows[aud_bank.name]["included_in_total"] is True
    assert rows[business_bank.name]["cash_role"] == "business"
    assert rows[business_bank.name]["included_in_total"] is False
    assert rows[business_bank.name]["included_in_cash_total"] is True
    assert rows[aud_savings.name]["included_in_total"] is False


def test_cashflow_keeps_business_checking_out_of_personal_cashflow():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    personal_account = _make_account(session, currency="USD")
    business_account = Account(
        name="Business Checking",
        type="checking",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(business_account)
    session.flush()
    food = _make_category(session, "Food")
    _make_transaction(
        session,
        account_id=personal_account.id,
        date="2026-03-01",
        amount=100.0,
        currency="USD",
        description="Personal income",
    )
    personal_spend = _make_transaction(
        session,
        account_id=personal_account.id,
        date="2026-03-02",
        amount=-40.0,
        currency="USD",
        description="Personal spend",
    )
    _make_transaction(
        session,
        account_id=business_account.id,
        date="2026-03-03",
        amount=1000.0,
        currency="USD",
        description="Business deposit",
    )
    business_spend = _make_transaction(
        session,
        account_id=business_account.id,
        date="2026-03-04",
        amount=-250.0,
        currency="USD",
        description="Business expense",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=personal_spend.id,
                category_id=food.id,
                amount=-40.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=business_spend.id,
                category_id=food.id,
                amount=-250.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    cashflow = {row["month"]: row for row in reports.cashflow_by_month(session)}
    category_spend = reports.category_spend(session)

    assert cashflow["2026-03"]["inflow"] == pytest.approx(100.0)
    assert cashflow["2026-03"]["outflow"] == pytest.approx(40.0)
    assert cashflow["2026-03"]["net"] == pytest.approx(60.0)
    assert cashflow["2026-03"]["business_inflow"] == pytest.approx(1000.0)
    assert cashflow["2026-03"]["business_outflow"] == pytest.approx(250.0)
    assert cashflow["2026-03"]["business_net"] == pytest.approx(750.0)
    assert cashflow["2026-03"]["total_net"] == pytest.approx(810.0)
    assert len(category_spend) == 1
    assert category_spend[0]["category"] == "Food"
    assert category_spend[0]["total"] == pytest.approx(40.0)
    assert category_spend[0]["currency"] == "USD"


def test_budget_status_uses_income_actuals_for_income_categories():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = _make_account(session, currency="AUD")
    income = _make_category(session, "Income")
    month = BudgetMonth(month="2026-03", rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.flush()
    session.add(
        BudgetCategoryTarget(
            budget_month_id=month.id,
            category_id=income.id,
            amount=100.0,
            rollover_amount=0.0,
        )
    )
    txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-03",
        amount=150.0,
        currency="AUD",
        description="Employer wage",
    )
    negative_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-04",
        amount=-30.0,
        currency="AUD",
        description="Income correction",
    )
    session.add(
        TransactionSplit(
            transaction_id=txn.id,
            category_id=income.id,
            amount=150.0,
            currency="AUD",
            classification="Personal",
            notes=None,
            business_percent=None,
        )
    )
    session.add(
        TransactionSplit(
            transaction_id=negative_txn.id,
            category_id=income.id,
            amount=-30.0,
            currency="AUD",
            classification="Personal",
            notes=None,
            business_percent=None,
        )
    )
    session.commit()

    result = reports.budget_status(session, month="2026-03")

    assert result["targets"][0]["category"] == "Income"


def test_budget_status_respects_requested_month_without_saved_budget_row():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="USD")
    food = _make_category(session, "Food")

    jan_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-01-10",
        amount=-20.0,
        currency="USD",
        description="January Groceries",
    )
    feb_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-02-10",
        amount=-35.0,
        currency="USD",
        description="February Groceries",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=jan_txn.id,
                category_id=food.id,
                amount=-20.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=feb_txn.id,
                category_id=food.id,
                amount=-35.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    january = reports.budget_status(session, month="2026-01")
    february = reports.budget_status(session, month="2026-02")

    assert january["month"] == "2026-01"
    assert january["total_spent"] == pytest.approx(20.0)
    assert february["month"] == "2026-02"
    assert february["total_spent"] == pytest.approx(35.0)


def test_budget_matrix_excludes_business_classified_activity():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = _make_account(session, currency="USD")
    business = _make_category(session, "Business")

    txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-03",
        amount=-24.15,
        currency="USD",
        description="AWS",
        payee="Amazon Web Services",
    )
    session.add(
        TransactionSplit(
            transaction_id=txn.id,
            category_id=business.id,
            amount=-24.15,
            currency="USD",
            classification="Business",
            notes=None,
            business_percent=None,
        )
    )
    txn.classification = "Business"
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)
    month = "2026-03"
    rows = {row["name"]: row for row in matrix["categories"]}

    assert rows["Lifestyle"]["expense"][month] == pytest.approx(0.0)
    assert matrix["totals"]["expense"][month] == pytest.approx(0.0)


def test_budget_matrix_uses_actuals_for_closed_months():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="USD")
    income = _make_category(session, "Income")
    closed_month = _shift_month_label(-1)
    month = BudgetMonth(month=closed_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.flush()
    session.add(
        BudgetBucketTarget(
            budget_month_id=month.id,
            budget_bucket="income",
            amount=100.0,
            rollover_amount=0.0,
        )
    )
    txn = _make_transaction(
        session,
        account_id=account.id,
        date=f"{closed_month}-05",
        amount=150.0,
        currency="USD",
        description="Employer wage",
    )
    session.add(
        TransactionSplit(
            transaction_id=txn.id,
            category_id=income.id,
            amount=150.0,
            currency="USD",
            classification="Personal",
            notes=None,
            business_percent=None,
        )
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=int(closed_month[:4]))
    income_row = next(row for row in matrix["categories"] if row["id"] == "income")

    assert income_row["editable"][closed_month] is False
    assert income_row["effective_budget"][closed_month] == pytest.approx(150.0)
    assert matrix["month_meta"][closed_month]["state"] == "past"
    assert matrix["totals"]["effective_income"][closed_month] == pytest.approx(150.0)


def test_budget_matrix_carries_opening_liquid_balance_into_cumulative_cashflow():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="USD")
    income = _make_category(session, "Income")
    food = _make_category(session, "Food")

    opening_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2025-12-31",
        amount=200.0,
        currency="USD",
        description="Opening cash",
    )
    jan_income = _make_transaction(
        session,
        account_id=account.id,
        date="2026-01-05",
        amount=100.0,
        currency="USD",
        description="Employer wage",
    )
    jan_spend = _make_transaction(
        session,
        account_id=account.id,
        date="2026-01-07",
        amount=-150.0,
        currency="USD",
        description="Groceries",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=opening_txn.id,
                category_id=income.id,
                amount=200.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=jan_income.id,
                category_id=income.id,
                amount=100.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=jan_spend.id,
                category_id=food.id,
                amount=-150.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)

    assert matrix["totals"]["opening_liquid_balance"] == pytest.approx(200.0)
    assert matrix["month_meta"]["2026-01"]["remaining_to_allocate"] == pytest.approx(-50.0)
    assert matrix["month_meta"]["2026-01"]["cumulative_cashflow"] == pytest.approx(150.0)
    assert matrix["totals"]["cumulative_cashflow"]["2026-01"] == pytest.approx(150.0)


def test_budget_matrix_opening_cash_uses_bank_ledgers_not_savings():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    bank_account = Account(
        name="Primary Bank",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    savings_account = Account(
        name="Savings Bucket",
        type="savings",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    business_account = Account(
        name="Business Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    income = _make_category(session, "Income")
    food = _make_category(session, "Food")
    session.add_all([bank_account, savings_account, business_account])
    session.flush()

    bank_opening = _make_transaction(
        session,
        account_id=bank_account.id,
        date="2025-12-31",
        amount=200.0,
        currency="USD",
        description="Bank opening",
    )
    savings_opening = _make_transaction(
        session,
        account_id=savings_account.id,
        date="2025-12-31",
        amount=75.0,
        currency="USD",
        description="Savings opening",
    )
    business_opening = _make_transaction(
        session,
        account_id=business_account.id,
        date="2025-12-31",
        amount=500.0,
        currency="USD",
        description="Business opening",
    )
    jan_spend = _make_transaction(
        session,
        account_id=bank_account.id,
        date="2026-01-07",
        amount=-50.0,
        currency="USD",
        description="Groceries",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=bank_opening.id,
                category_id=income.id,
                amount=200.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=savings_opening.id,
                category_id=income.id,
                amount=75.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=business_opening.id,
                category_id=income.id,
                amount=500.0,
                currency="USD",
                classification="Business",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=jan_spend.id,
                category_id=food.id,
                amount=-50.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)

    assert matrix["totals"]["opening_liquid_balance"] == pytest.approx(200.0)
    assert matrix["month_meta"]["2026-01"]["cumulative_cashflow"] == pytest.approx(150.0)


def test_budget_matrix_includes_subcategory_actual_breakdown():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="AUD")
    transport = _make_category(session, "Transport")
    train = _make_subcategory(session, transport.id, "Train")
    bus = _make_subcategory(session, transport.id, "Bus")

    train_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=-12.0,
        currency="AUD",
        description="Transperth train",
        payee="Transperth",
    )
    bus_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-06",
        amount=-8.0,
        currency="AUD",
        description="Transperth bus",
        payee="Transperth",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=train_txn.id,
                category_id=transport.id,
                subcategory_id=train.id,
                amount=-12.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=bus_txn.id,
                category_id=transport.id,
                subcategory_id=bus.id,
                amount=-8.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)
    transport_row = next(row for row in matrix["categories"] if row["id"] == "transport")
    sub_map = {row["name"]: row for row in transport_row["subcategories"]}

    assert sub_map["Train"]["expense"]["2026-03"] == pytest.approx(12.0)
    assert sub_map["Bus"]["expense"]["2026-03"] == pytest.approx(8.0)


def test_budget_matrix_includes_defined_subcategories_without_actuals():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    transport = _make_category(session, "Transport")
    train = _make_subcategory(session, transport.id, "Train")
    session.commit()

    matrix = reports.budget_matrix(session, year=2026)
    transport_row = next(row for row in matrix["categories"] if row["id"] == "transport")
    sub_map = {row["name"]: row for row in transport_row["subcategories"]}

    assert "Train" in sub_map
    assert sub_map["Train"]["subcategory_id"] == train.id
    assert sub_map["Train"]["expense"]["2026-03"] == pytest.approx(0.0)


def test_budget_cell_transactions_can_filter_to_subcategory_or_unassigned():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="AUD")
    transport = _make_category(session, "Transport")
    train = _make_subcategory(session, transport.id, "Train")

    train_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=-12.0,
        currency="AUD",
        description="Transperth train",
        payee="Transperth",
    )
    other_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-06",
        amount=-5.0,
        currency="AUD",
        description="Taxi",
        payee="Taxi",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=train_txn.id,
                category_id=transport.id,
                subcategory_id=train.id,
                amount=-12.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=other_txn.id,
                category_id=transport.id,
                subcategory_id=None,
                amount=-5.0,
                currency="AUD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    train_only = reports.budget_bucket_transactions(session, month="2026-03", bucket_key="transport", subcategory_id=train.id)
    unassigned_only = reports.budget_bucket_transactions(session, month="2026-03", bucket_key="transport", unassigned=True)

    assert [txn["transaction_id"] for txn in train_only["transactions"]] == [train_txn.id]
    assert train_only["actual_total"] == pytest.approx(12.0)
    assert [txn["transaction_id"] for txn in unassigned_only["transactions"]] == [other_txn.id]
    assert unassigned_only["actual_total"] == pytest.approx(5.0)


def test_budget_bucket_transactions_match_expense_act_value_with_refund_offset():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="USD")
    food = _make_category(session, "Food")

    spend_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=-100.0,
        currency="USD",
        description="Groceries",
    )
    refund_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2026-03-12",
        amount=20.0,
        currency="USD",
        description="Groceries refund",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=spend_txn.id,
                category_id=food.id,
                amount=-100.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=refund_txn.id,
                category_id=food.id,
                amount=20.0,
                currency="USD",
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    result = reports.budget_bucket_transactions(session, month="2026-03", bucket_key="food")

    assert result["bucket_name"] == "Food"
    assert result["actual_total"] == pytest.approx(80.0)
    assert len(result["transactions"]) == 2
    assert result["transactions"][0]["description"] == "Groceries refund"
    assert result["transactions"][0]["effect_on_actual"] == pytest.approx(-20.0)
    assert result["transactions"][1]["description"] == "Groceries"
    assert result["transactions"][1]["effect_on_actual"] == pytest.approx(100.0)


def test_past_month_budget_targets_are_locked():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    past_month = _shift_month_label(-1)
    month = BudgetMonth(month=past_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.commit()

    with pytest.raises(HTTPException, match="locked"):
        budgets_api.create_budget_bucket_target(
            BudgetBucketTargetCreate(
                budget_month_id=month.id,
                budget_bucket="income",
                amount=100.0,
                rollover_amount=0.0,
            ),
            session,
        )


def test_future_expense_budget_requires_income_support():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.commit()

    with pytest.raises(HTTPException, match="projected closing checking balance"):
        budgets_api.create_budget_bucket_target(
            BudgetBucketTargetCreate(
                budget_month_id=month.id,
                budget_bucket="food",
                amount=75.0,
                rollover_amount=0.0,
            ),
            session,
        )


def test_future_expense_budget_cannot_exceed_income_limit():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.commit()

    budgets_api.create_budget_bucket_target(
        BudgetBucketTargetCreate(
            budget_month_id=month.id,
            budget_bucket="income",
            amount=100.0,
            rollover_amount=0.0,
        ),
        session,
    )

    with pytest.raises(HTTPException, match="projected closing checking balance"):
        budgets_api.create_budget_bucket_target(
            BudgetBucketTargetCreate(
                budget_month_id=month.id,
                budget_bucket="food",
                amount=175.0,
                rollover_amount=0.0,
            ),
            session,
        )


def test_future_expense_budget_can_use_prior_cash_rollover():
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    account = _make_account(session, currency="USD")
    income = _make_category(session, "Income")
    opening_txn = _make_transaction(
        session,
        account_id=account.id,
        date="2025-12-31",
        amount=200.0,
        currency="USD",
        description="Opening cash",
    )
    session.add(
        TransactionSplit(
            transaction_id=opening_txn.id,
            category_id=income.id,
            amount=200.0,
            currency="USD",
            classification="Personal",
            notes=None,
            business_percent=None,
        )
    )
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.commit()

    target = budgets_api.create_budget_bucket_target(
        BudgetBucketTargetCreate(
            budget_month_id=month.id,
            budget_bucket="food",
            amount=125.0,
            rollover_amount=0.0,
        ),
        session,
    )

    assert target.amount == pytest.approx(125.0)


def test_budget_editing_triggers_fortnightly_plaid_refresh_when_stale(monkeypatch):
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="token",
            institution_id="ins_1",
            institution_name="Sample Credit Union",
            status="active",
            cursor=None,
            created_at=_now_str(),
            updated_at="2026-02-01T00:00:00+00:00",
        )
    )
    session.commit()

    calls: list[tuple[str, bool | None]] = []
    monkeypatch.setattr(budgets_api, "plaid_is_configured", lambda: True)
    monkeypatch.setattr(
        budgets_api,
        "sync_plaid_transactions",
        lambda session, full=False: calls.append(("plaid", full)) or {},
    )

    budgets_api.create_budget_bucket_target(
        BudgetBucketTargetCreate(
            budget_month_id=month.id,
            budget_bucket="income",
            amount=100.0,
            rollover_amount=0.0,
        ),
        session,
    )

    assert calls == [("plaid", False)]


def test_budget_editing_triggers_fortnightly_up_refresh_when_stale(monkeypatch):
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    account = Account(
        name="Up Spending",
        type="bank",
        currency="AUD",
        institution="Up",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add_all([month, account])
    session.flush()
    session.add(
        UpAccount(
            up_account_id="up-1",
            account_id=account.id,
            name="Up Spending",
            account_type="TRANSACTIONAL",
            ownership_type="INDIVIDUAL",
            currency="AUD",
            is_active=1,
            last_synced_at="2026-02-01T00:00:00+00:00",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    calls: list[str] = []
    monkeypatch.setattr(budgets_api, "up_is_configured", lambda: True)
    monkeypatch.setattr(
        budgets_api,
        "sync_up_transactions",
        lambda session, full=False: calls.append(f"transactions:{full}") or {},
    )

    budgets_api.create_budget_bucket_target(
        BudgetBucketTargetCreate(
            budget_month_id=month.id,
            budget_bucket="income",
            amount=100.0,
            rollover_amount=0.0,
        ),
        session,
    )

    assert calls == ["transactions:False"]


def test_budget_editing_skips_bank_refresh_when_links_are_fresh(monkeypatch):
    session = make_session()
    _seed_fx_rates(session, [1.0] * 14)
    future_month = _shift_month_label(1)
    month = BudgetMonth(month=future_month, rollover_enabled=0, created_at=_now_str())
    account = Account(
        name="Up Spending",
        type="bank",
        currency="AUD",
        institution="Up",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add_all([month, account])
    session.flush()
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="token",
            institution_id="ins_1",
            institution_name="Sample Credit Union",
            status="active",
            cursor="cursor-1",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        UpAccount(
            up_account_id="up-1",
            account_id=account.id,
            name="Up Spending",
            account_type="TRANSACTIONAL",
            ownership_type="INDIVIDUAL",
            currency="AUD",
            is_active=1,
            last_synced_at=_now_str(),
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    plaid_calls: list[str] = []
    up_calls: list[str] = []
    monkeypatch.setattr(budgets_api, "plaid_is_configured", lambda: True)
    monkeypatch.setattr(budgets_api, "up_is_configured", lambda: True)
    monkeypatch.setattr(
        budgets_api,
        "sync_plaid_transactions",
        lambda session, full=False: plaid_calls.append("plaid") or {},
    )
    monkeypatch.setattr(
        budgets_api,
        "sync_up_transactions",
        lambda session, full=False: up_calls.append("transactions") or {},
    )

    budgets_api.create_budget_bucket_target(
        BudgetBucketTargetCreate(
            budget_month_id=month.id,
            budget_bucket="income",
            amount=100.0,
            rollover_amount=0.0,
        ),
        session,
    )

    assert plaid_calls == []
    assert up_calls == []


def test_budget_api_routes_do_not_expose_legacy_category_target_or_month_mutation_endpoints():
    exposed = {
        (route.path, method)
        for route in budgets_api.router.routes
        for method in (route.methods or set())
        if method not in {"HEAD", "OPTIONS"}
    }

    assert ("/budgets/targets", "GET") not in exposed
    assert ("/budgets/targets", "POST") not in exposed
    assert ("/budgets/targets/{target_id}", "POST") not in exposed
    assert ("/budgets/targets/{target_id}", "DELETE") not in exposed
    assert ("/budgets/months/{month_id}", "POST") not in exposed
    assert ("/budgets/months/{month_id}", "DELETE") not in exposed
    assert ("/budgets", "GET") in exposed
    assert ("/budgets/months", "POST") in exposed
    assert ("/budgets/bucket-targets", "GET") in exposed
    assert ("/budgets/bucket-targets", "POST") in exposed


def test_bucket_target_listing_does_not_bootstrap_from_legacy_category_targets():
    session = make_session()
    category = _make_category(session, "Food")
    month = BudgetMonth(month="2026-03", rollover_enabled=0, created_at=_now_str())
    session.add(month)
    session.flush()
    session.add(
        BudgetCategoryTarget(
            budget_month_id=month.id,
            category_id=category.id,
            amount=120.0,
            rollover_amount=0.0,
        )
    )
    session.commit()

    targets = budgets_api.list_budget_bucket_targets(budget_month_id=month.id, session=session)

    assert targets == []
    assert session.execute(select(BudgetBucketTarget)).scalars().all() == []
