from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from backend.app.features.classification import service as classification
from backend.app.features.classification.models import MerchantProfile, Rule, TransactionMemory
from backend.app.features.fx.models import FXRate
from backend.app.features.ledger.models import Account, Transaction, TransactionSplit
from backend.app.features.settings.service import set_setting
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _seed_fx_rates(session, value: float = 1.5, days: int = 14, end_date: date | None = None) -> None:
    end_date = end_date or datetime.now(tz=timezone.utc).date()
    start_date = end_date - timedelta(days=days - 1)
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        session.add(
            FXRate(
                date=day.isoformat(),
                aud_per_usd=value,
                source="test",
                created_at=_now_str(),
            )
        )
    session.commit()


def _make_account(session, name: str, currency: str) -> Account:
    account = Account(
        name=name,
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


def _make_txn(
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


def test_same_currency_owned_account_transfer_is_classified_as_transfer():
    session = make_session()
    checking = _make_account(session, "Everyday Checking", "USD")
    savings = _make_account(session, "Savings Buffer", "USD")
    _make_txn(
        session,
        account_id=savings.id,
        date="2026-03-01",
        amount=500.0,
        currency="USD",
        description="Transfer from Everyday Checking",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": checking.id,
            "date": "2026-03-01",
            "amount": -500.0,
            "currency": "USD",
            "description": "Transfer to Savings Buffer",
            "payee": "Transfer to Savings Buffer",
            "notes": "",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] == "transfer_match"
    assert result["flow_type"] == "internal_transfer"


def test_business_checking_transfer_to_personal_account_is_business_distribution():
    session = make_session()
    business = _make_account(session, "Sample Credit Union Business Checking", "USD")
    personal = _make_account(session, "Sample Credit Union Main Checking", "USD")
    _make_txn(
        session,
        account_id=personal.id,
        date="2026-04-28",
        amount=230.0,
        currency="USD",
        description="Web Branch:TFR FROM CK 395654804",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": business.id,
            "date": "2026-04-28",
            "amount": -230.0,
            "currency": "USD",
            "description": "Web Branch:TFR TO CK 395654803",
            "payee": "Web Branch:TFR TO CK 395654803",
            "notes": "",
        },
    )

    assert result["category_name"] == "Business"
    assert result["classification"] == "Business"
    assert result["source"] == "business_owner_transfer"
    assert result["flow_type"] == "business_owner_distribution"


def test_personal_inflow_from_business_checking_is_income_not_transfer():
    session = make_session()
    business = _make_account(session, "Sample Credit Union Business Checking", "USD")
    personal = _make_account(session, "Sample Credit Union Main Checking", "USD")
    _make_txn(
        session,
        account_id=business.id,
        date="2026-04-28",
        amount=-230.0,
        currency="USD",
        description="Web Branch:TFR TO CK 395654803",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": personal.id,
            "date": "2026-04-28",
            "amount": 230.0,
            "currency": "USD",
            "description": "Web Branch:TFR FROM CK 395654804",
            "payee": "Web Branch:TFR FROM CK 395654804",
            "notes": "",
        },
    )

    assert result["category_name"] == "Income"
    assert result["classification"] == "Personal"
    assert result["source"] == "business_owner_income"
    assert result["flow_type"] == "business_owner_distribution"


def test_business_checking_positive_inflow_defaults_to_business():
    session = make_session()
    business = _make_account(session, "Sample Credit Union Business Checking", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": business.id,
            "date": "2026-04-27",
            "amount": 1000.0,
            "currency": "USD",
            "description": "ACH:CLIENT PAYMENT",
            "payee": "Client Payment",
            "notes": "",
        },
    )

    assert result["category_name"] == "Business"
    assert result["classification"] == "Business"
    assert result["source"] == "business_account_inflow"


def test_apply_classification_updates_existing_single_split_category_and_classification():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Business Checking", "USD")
    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-04-28",
        amount=-230.0,
        currency="USD",
        description="Web Branch:TFR TO CK 395654803",
    )
    transfer_category_id = classification._ensure_category(session, "Transfers")
    split = TransactionSplit(
        transaction_id=txn.id,
        category_id=transfer_category_id,
        subcategory_id=None,
        amount=txn.amount,
        currency=txn.currency,
        classification="Personal",
        notes="Existing split",
        business_percent=None,
    )
    session.add(split)
    session.flush()

    result = {
        "category_id": classification._ensure_category(session, "Business"),
        "category_name": "Business",
        "classification": "Business",
        "merchant_name": txn.description,
        "source": "business_owner_transfer",
    }
    classification.apply_classification(session, txn.id, result)
    session.flush()

    assert txn.classification == "Business"
    assert split.category_id == result["category_id"]
    assert split.classification == "Business"


def test_cross_currency_wise_transfer_between_owned_accounts_is_classified_as_transfer():
    session = make_session()
    _seed_fx_rates(session, value=1.5, end_date=date(2026, 3, 4))
    up = _make_account(session, "UP Spending", "AUD")
    plaid = _make_account(session, "Plaid USD", "USD")
    _make_txn(
        session,
        account_id=plaid.id,
        date="2026-03-04",
        amount=660.0,
        currency="USD",
        description="Wise transfer from UP Spending",
        payee="WISE",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": up.id,
            "date": "2026-03-04",
            "amount": -1000.0,
            "currency": "AUD",
            "description": "Wise transfer to Plaid USD",
            "payee": "WISE",
            "notes": "monthly top up",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] in {"transfer_fx_match", "transfer_counterparty_override"}
    assert result["flow_type"] == "internal_transfer"
    assert "as of 2026-03-04" in (result["note"] or "")
    assert "implied_fee≈10.00 AUD" in (result["note"] or "")


def test_cross_currency_self_named_wise_transfer_is_classified_as_transfer():
    session = make_session()
    _seed_fx_rates(session, value=1.42, end_date=date(2026, 3, 6))
    up = _make_account(session, "Spending", "AUD")
    plaid = _make_account(session, "Sample Credit Union Main Checking", "USD")
    groceries_category_id = classification._ensure_category(session, "Groceries")
    session.add(
        MerchantProfile(
            name="Sample User",
            normalized_name=classification.normalize_merchant("Sample User"),
            currency="AUD",
            default_category_id=groceries_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    _make_txn(
        session,
        account_id=plaid.id,
        date="2026-03-06",
        amount=844.85,
        currency="USD",
        description="ACH:Sample User -WISE",
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": up.id,
            "date": "2026-03-05",
            "amount": -1200.0,
            "currency": "AUD",
            "description": "Sample User",
            "payee": "",
            "notes": "",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] in {"transfer_fx_match", "transfer_counterparty_override"}
    assert result["flow_type"] == "internal_transfer"
    assert result["note"]


def test_cross_currency_wise_transfer_can_match_reviewed_self_name_counterparty():
    session = make_session()
    _seed_fx_rates(session, value=1.48, end_date=date(2025, 12, 29))
    up = _make_account(session, "Spending", "AUD")
    plaid = _make_account(session, "Sample Credit Union Main Checking", "USD")
    transfer_category_id = classification._ensure_category(session, "Transfers")
    session.add(
        Rule(
            name="Reviewed self-name transfer",
            field="description",
            operator="equals",
            value="Sample User",
            category_id=transfer_category_id,
            payee=None,
            memo_contains=None,
            is_active=1,
        )
    )
    _make_txn(
        session,
        account_id=up.id,
        date="2025-12-27",
        amount=670.0,
        currency="AUD",
        description="Sample User",
        payee="Sample User",
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": plaid.id,
            "date": "2025-12-29",
            "amount": -452.95,
            "currency": "USD",
            "description": "ACH:Wise Inc -WISE",
            "payee": "",
            "notes": "",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] == "transfer_fx_match"
    assert result["flow_type"] == "internal_transfer"
    assert "counterparty_rule=transfer" in (result["note"] or "")


def test_cross_currency_transfer_uses_transaction_date_fx_not_latest_average():
    session = make_session()
    session.add_all(
        [
            FXRate(
                date="2026-03-04",
                aud_per_usd=1.5,
                source="test",
                created_at=_now_str(),
            ),
            FXRate(
                date="2026-03-20",
                aud_per_usd=1.8,
                source="test",
                created_at=_now_str(),
            ),
        ]
    )
    session.commit()
    up = _make_account(session, "UP Spending", "AUD")
    plaid = _make_account(session, "Plaid USD", "USD")
    _make_txn(
        session,
        account_id=plaid.id,
        date="2026-03-04",
        amount=660.0,
        currency="USD",
        description="Wise transfer from UP Spending",
        payee="WISE",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": up.id,
            "date": "2026-03-04",
            "amount": -1000.0,
            "currency": "AUD",
            "description": "Wise transfer to Plaid USD",
            "payee": "WISE",
            "notes": "monthly top up",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] == "transfer_fx_match"
    assert "fx=1.5000 AUD/USD as of 2026-03-04" in (result["note"] or "")
    assert "implied_fee≈10.00 AUD (6.67 USD)" in (result["note"] or "")


def test_self_name_positive_row_is_forced_to_transfer_not_income():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-05",
            "amount": 120.0,
            "currency": "AUD",
            "description": "JACOB N WICKLUND",
            "payee": "JACOB N WICKLUND",
            "notes": "",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] == "transfer_counterparty_override"
    assert result["flow_type"] == "internal_transfer"


def test_external_wise_rent_payment_reaches_local_ai_instead_of_transfer(monkeypatch):
    session = make_session()
    _seed_fx_rates(session, value=1.5, end_date=date(2026, 3, 5))
    account = _make_account(session, "UP Spending", "AUD")
    transfer_category_id = classification._ensure_category(session, "Transfers")
    session.add(
        MerchantProfile(
            name="WISE",
            normalized_name=classification.normalize_merchant("WISE"),
            currency="AUD",
            default_category_id=transfer_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    prompts: list[str] = []

    def fake_local_ai_call(_session, prompt: str):
        prompts.append(prompt)
        return {
            "category": "Housing & Bills",
            "classification": "Personal",
            "merchant_name": "John Smith",
            "note": "Recurring rent paid using Wise rail",
        }

    set_setting(session, "local_ai_enabled", "true")
    monkeypatch.setattr(classification, "_local_ai_call", fake_local_ai_call)

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-05",
            "amount": -850.0,
            "currency": "AUD",
            "description": "Wise transfer for March rent",
            "payee": "WISE",
            "notes": "rent to John Smith",
            "bank_category": "Transfer",
        },
    )

    assert result["category_name"] == "Housing & Bills"
    assert result["source"] == "local_ai"
    assert prompts
    assert "Use category 'Transfers' only when evidence shows money moved between the user's own accounts." in prompts[0]
    assert "- bank_transfer_hint: Transfer" in prompts[0]
    assert "- bank_rail_hint: transfer" in prompts[0]
    assert "- matched_owned_account_transfer: none" in prompts[0]

    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-03-05",
        amount=-850.0,
        currency="AUD",
        description="Wise transfer for March rent",
        payee="WISE",
        notes="rent to John Smith",
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()
    assert len(profiles) == 1
    assert profiles[0].name == "WISE"
    assert memories == []


def test_person_like_payid_rent_reaches_local_ai_instead_of_friends_profile(monkeypatch):
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    friends_category_id = classification._ensure_category(session, "Friends & Family")
    session.add(
        MerchantProfile(
            name="John Smith",
            normalized_name=classification.normalize_merchant("John Smith"),
            currency="AUD",
            default_category_id=friends_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    prompts: list[str] = []

    def fake_local_ai_call(_session, prompt: str):
        prompts.append(prompt)
        return {
            "category": "Housing & Bills",
            "classification": "Personal",
            "merchant_name": "John Smith",
            "note": "Weekly rent paid to landlord via PayID",
        }

    set_setting(session, "local_ai_enabled", "true")
    monkeypatch.setattr(classification, "_local_ai_call", fake_local_ai_call)

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-06",
            "amount": -400.0,
            "currency": "AUD",
            "description": "PAYID transfer",
            "payee": "PAYID JOHN SMITH",
            "notes": "weekly rent",
        },
    )

    assert result["category_name"] == "Housing & Bills"
    assert result["source"] == "local_ai"
    assert prompts
    assert "- social_p2p_hint: payid" in prompts[0]
    assert "- person_like_counterparty: yes" in prompts[0]

    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-03-06",
        amount=-400.0,
        currency="AUD",
        description="PAYID transfer",
        payee="PAYID JOHN SMITH",
        notes="weekly rent",
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()
    assert len(profiles) == 1
    assert profiles[0].name == "John Smith"
    assert memories == []


def test_rule_based_transfer_skips_profile_and_memory():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    transfer_category_id = classification._ensure_category(session, "Transfers")
    groceries_category_id = classification._ensure_category(session, "Groceries")
    session.add(
        MerchantProfile(
            name="Sample User",
            normalized_name=classification.normalize_merchant("Sample User"),
            currency="AUD",
            default_category_id=groceries_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        Rule(
            name="Reviewed transfer",
            field="notes",
            operator="contains",
            value="reviewed-self-transfer",
            category_id=transfer_category_id,
            payee=None,
            memo_contains=None,
            is_active=1,
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-06",
            "amount": -250.0,
            "currency": "AUD",
            "description": "Sample User",
            "payee": "",
            "notes": "reviewed-self-transfer",
        },
    )

    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-03-06",
        amount=-250.0,
        currency="AUD",
        description="Sample User",
        notes="reviewed-self-transfer",
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()

    assert result["category_name"] == "Transfers"
    assert result["source"] in {"rule", "transfer_counterparty_override"}
    assert result["flow_type"] == "internal_transfer"
    assert len(profiles) == 1
    assert profiles[0].name == "Sample User"
    assert memories == []


def test_rule_based_debt_payment_description_is_applied():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Main Checking", "USD")
    debt_category_id = classification._ensure_category(session, "Debt")
    session.add(
        Rule(
            name="Reviewed PayPal retry debt",
            field="description",
            operator="equals",
            value="PAYPAL RETRY PYMT",
            category_id=debt_category_id,
            payee=None,
            memo_contains=None,
            is_active=1,
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-15",
            "amount": 573.0,
            "currency": "USD",
            "description": "PAYPAL RETRY PYMT",
            "payee": "",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "rule"


def test_positive_employer_inflow_ignores_expense_profile_and_classifies_income():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")
    food_category_id = classification._ensure_category(session, "Food")
    session.add(
        MerchantProfile(
            name="Sample Employer",
            normalized_name=classification.normalize_merchant("Sample Employer"),
            currency="AUD",
            default_category_id=food_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": 2400.0,
            "currency": "AUD",
            "description": "Sample Employer",
            "payee": "Payroll Services Pty",
            "notes": "weekly wages",
        },
    )

    assert result["category_name"] == "Income"
    assert result["source"] == "employer_keyword"


def test_afterpay_ignores_transport_profile_and_classifies_debt():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")
    transport_category_id = classification._ensure_category(session, "Transport")
    session.add(
        MerchantProfile(
            name="Afterpay, afterpay.com",
            normalized_name=classification.normalize_merchant("Afterpay, afterpay.com"),
            currency="AUD",
            default_category_id=transport_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -90.84,
            "currency": "AUD",
            "description": "Afterpay",
            "payee": "Afterpay, afterpay.com",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "debt_counterparty_override"


def test_atm_cash_out_ignores_food_profile_and_classifies_cash_atm():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")
    food_category_id = classification._ensure_category(session, "Food")
    session.add(
        MerchantProfile(
            name="Cash Out",
            normalized_name=classification.normalize_merchant("Cash Out"),
            currency="AUD",
            default_category_id=food_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -120.0,
            "currency": "AUD",
            "description": "ATM Cash Out",
            "payee": "",
            "notes": "",
            "mcc": "6011",
        },
    )

    assert result["category_name"] == "Cash & ATM"
    assert result["source"] in {"cash_atm_keyword", "cash_atm_mcc"}
    assert result["flow_type"] == "cash_movement"


def test_operator_fee_ignores_food_profile_and_classifies_cash_atm():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")
    food_category_id = classification._ensure_category(session, "Food")
    session.add(
        MerchantProfile(
            name="Operator Fee",
            normalized_name=classification.normalize_merchant("Operator Fee"),
            currency="AUD",
            default_category_id=food_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -2.5,
            "currency": "AUD",
            "description": "Operator Fee",
            "payee": "Operator Fee",
            "notes": "",
        },
    )

    assert result["category_name"] == "Cash & ATM"
    assert result["source"] == "cash_atm_keyword"
    assert result["flow_type"] == "cash_movement"


def test_dishonour_rows_do_not_create_merchant_profile_or_memory():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-02-24",
        amount=130.9,
        currency="AUD",
        description="Direct Debit Dishonour",
        payee="Dishonour",
        notes="bank reversal",
    )
    session.commit()

    result = {
        "category_id": classification._ensure_category(session, "Housing & Bills"),
        "category_name": "Housing & Bills",
        "classification": "Personal",
        "merchant_name": "Dishonour",
        "source": "test",
    }
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()

    assert profiles == []
    assert memories == []


def test_readygrad_is_treated_as_lifestyle_education_spend():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")
    savings_category_id = classification._ensure_category(session, "Savings")
    session.add(
        MerchantProfile(
            name="READYGRAD* G56 READYG\\",
            normalized_name=classification.normalize_merchant("READYGRAD* G56 READYG\\"),
            currency="AUD",
            default_category_id=savings_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -423.97,
            "currency": "AUD",
            "description": "READYGRAD* G56 READYG\\",
            "payee": "READYGRAD* G56 READYG\\",
            "notes": "",
        },
    )

    assert result["category_name"] == "Lifestyle"
    assert result["source"] == "education_expense_keyword"


def test_aws_is_classified_as_business_expense():
    session = make_session()
    account = _make_account(session, "Business Checking", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -24.15,
            "currency": "USD",
            "description": "AWS",
            "payee": "Amazon Web Services",
            "notes": "",
        },
    )

    assert result["category_name"] == "Business"
    assert result["classification"] == "Business"
    assert result["source"] == "business_expense_keyword"


def test_bank_of_melbourne_account_is_treated_as_transfer():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -150.0,
            "currency": "AUD",
            "description": "Bank of Melbourne Account",
            "payee": "JACOB N WICKLUND",
            "notes": "",
        },
    )

    assert result["category_name"] == "Transfers"
    assert result["source"] in {"transfer_override_keyword", "transfer_counterparty_override"}
    assert result["flow_type"] == "internal_transfer"


def test_belmont_city_medical_is_classified_as_health():
    session = make_session()
    account = _make_account(session, "Everyday", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-07",
            "amount": -54.49,
            "currency": "USD",
            "description": "DEBITCARD 9455:PURCHASE Cloverdale 01/07/26 Belmont City Medical $0.54 INTL TR",
            "payee": "Belmont City Medical",
            "notes": "",
        },
    )

    assert result["category_name"] == "Health"
    assert result["source"] == "health_counterparty_override"


def test_city_electric_is_classified_as_lifestyle():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-22",
            "amount": -69.99,
            "currency": "AUD",
            "description": "CITY ELECTRIC SUPPL,WEST PERTH",
            "payee": "CITY ELECTRIC SUPPL,WEST PERTH",
            "notes": "",
        },
    )

    assert result["category_name"] == "Lifestyle"
    assert result["source"] == "lifestyle_counterparty_override"


def test_ausrec_is_classified_as_lifestyle():
    session = make_session()
    account = _make_account(session, "Everyday", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-09",
            "amount": -22.63,
            "currency": "USD",
            "description": "DEBITCARD 9455:PURCHASE Perth 01/09/26 AUSREC WA PTY LTD $0.22 INTL TR",
            "payee": "Ausrec Wa Pty LTD",
            "notes": "",
        },
    )

    assert result["category_name"] == "Lifestyle"
    assert result["source"] == "lifestyle_counterparty_override"


def test_negative_income_profile_does_not_override_debt_payment_signal():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Main Checking", "USD")
    income_category_id = classification._ensure_category(session, "Income")
    session.add(
        MerchantProfile(
            name="Uwcu",
            normalized_name=classification.normalize_merchant("Uwcu"),
            currency="USD",
            default_category_id=income_category_id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-06",
            "amount": -800.0,
            "currency": "USD",
            "description": "Web Branch:Sample CU VISA PAYMENT XX-0695",
            "payee": "Uwcu",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "debt_payment_keyword"


def test_positive_investment_proceeds_roll_up_to_income():
    session = make_session()
    account = _make_account(session, "Brokerage Cash", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": 82.14,
            "currency": "USD",
            "description": "Vanguard dividend distribution",
            "payee": "Vanguard",
            "notes": "fund payout",
        },
    )

    assert result["category_name"] == "Income"
    assert result["source"] == "investment_proceeds_keyword"


def test_large_sample_university_inflow_is_treated_as_debt_and_does_not_learn_profile():
    session = make_session()
    account = _make_account(session, "Everyday", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": 5000.0,
            "currency": "AUD",
            "description": "Sample Universit",
            "payee": "Sample Universit",
            "notes": "student loan disbursement",
        },
    )

    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-03-09",
        amount=5000.0,
        currency="AUD",
        description="Sample Universit",
        payee="Sample Universit",
        notes="student loan disbursement",
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()

    assert result["category_name"] == "Debt"
    assert result["source"] == "student_loan_disbursement"
    assert profiles == []
    assert memories == []


def test_positive_sallie_mae_inflow_is_treated_as_debt_not_income():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Main Checking", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-23",
            "amount": 560.0,
            "currency": "USD",
            "description": "Sallie Mae",
            "payee": "Sallie Mae",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "debt_servicer_inflow"


def test_positive_afterpay_inflow_is_treated_as_debt_not_income():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Main Checking", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-23",
            "amount": 45.0,
            "currency": "USD",
            "description": "Afterpay, afterpay.com",
            "payee": "Afterpay, afterpay.com",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "debt_counterparty_override"


def test_ranier_rows_are_treated_as_friends_family_support():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": 45.0,
            "currency": "AUD",
            "description": "RANIER DWEN OBAR ORD",
            "payee": "RANIER DWEN OBAR ORD",
            "notes": "",
        },
    )

    assert result["category_name"] == "Friends & Family"
    assert result["source"] == "friends_family_counterparty_override"
    assert result["flow_type"] == "external_p2p"


def test_t_nguyen_rows_are_treated_as_housing_even_for_refunds():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-10",
            "amount": 80.0,
            "currency": "AUD",
            "description": "THI HOANG PHUNG NGUYEN",
            "payee": "T NGUYEN",
            "notes": "Wed 14/1 refund",
        },
    )

    assert result["category_name"] == "Housing & Bills"
    assert result["source"] == "housing_counterparty_override"


def test_t_nguyen_override_beats_false_transfer_match():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    savings = _make_account(session, "Savings Buffer", "AUD")
    _make_txn(
        session,
        account_id=savings.id,
        date="2025-11-21",
        amount=550.0,
        currency="AUD",
        description="Top up from UP Spending",
        payee="Savings Buffer",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2025-11-21",
            "amount": -550.0,
            "currency": "AUD",
            "description": "THI HOANG PHUNG NGUYEN",
            "payee": "",
            "notes": "Accom 21 nov to 28 nov",
        },
    )

    assert result["category_name"] == "Housing & Bills"
    assert result["source"] == "housing_counterparty_override"


def test_afterpay_override_beats_false_transfer_match():
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    savings = _make_account(session, "Bonus credit card payment", "AUD")
    _make_txn(
        session,
        account_id=savings.id,
        date="2025-11-23",
        amount=0.75,
        currency="AUD",
        description="Round-up sweep",
        payee="Bonus credit card payment",
    )

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2025-11-23",
            "amount": -0.75,
            "currency": "AUD",
            "description": "Afterpay",
            "payee": "Afterpay, afterpay.com",
            "notes": "",
        },
    )

    assert result["category_name"] == "Debt"
    assert result["source"] == "debt_counterparty_override"


def test_sharon_gould_inflow_defaults_to_business_without_transfer_validation():
    session = make_session()
    account = _make_account(session, "Sample Credit Union Main Checking", "USD")

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-01-08",
            "amount": 300.0,
            "currency": "USD",
            "description": "Web Branch:MLink from Example Client",
            "payee": "Web Branch:MLink from Example Client",
            "notes": "",
        },
    )

    assert result["category_name"] == "Business"
    assert result["classification"] == "Business"
    assert result["source"] == "known_business_inflow"


def test_sharon_gould_inflow_becomes_friends_when_wise_match_exists():
    session = make_session()
    _seed_fx_rates(session, value=1.5, end_date=date(2026, 1, 8))
    usd = _make_account(session, "Sample Credit Union Main Checking", "USD")
    aud = _make_account(session, "UP Spending", "AUD")
    _make_txn(
        session,
        account_id=aud.id,
        date="2026-01-08",
        amount=-450.0,
        currency="AUD",
        description="Wise transfer to UP Spending",
        payee="WISE",
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "account_id": usd.id,
            "date": "2026-01-08",
            "amount": 300.0,
            "currency": "USD",
            "description": "Web Branch:MLink from Example Client",
            "payee": "Web Branch:MLink from Example Client",
            "notes": "",
        },
    )

    assert result["category_name"] == "Friends & Family"
    assert result["source"] == "wise_validated_support_payment"
    assert result["flow_type"] == "external_p2p"


def test_p2p_fallback_does_not_create_memory_or_profile(monkeypatch):
    session = make_session()
    account = _make_account(session, "UP Spending", "AUD")
    txn = _make_txn(
        session,
        account_id=account.id,
        date="2026-03-07",
        amount=-42.0,
        currency="AUD",
        description="VENMO payment",
        payee="VENMO *John Doe",
        notes="dinner split",
    )
    session.commit()

    result = classification.classify_payload(
        session,
        {
            "transaction_id": txn.id,
            "account_id": account.id,
            "date": txn.date,
            "amount": txn.amount,
            "currency": txn.currency,
            "description": txn.description,
            "payee": txn.payee,
            "notes": txn.notes,
        },
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    profiles = session.execute(select(MerchantProfile)).scalars().all()
    memories = session.execute(select(TransactionMemory)).scalars().all()

    assert result["category_name"] == "Friends & Family"
    assert result["source"] == "p2p_fallback"
    assert profiles == []
    assert memories == []
