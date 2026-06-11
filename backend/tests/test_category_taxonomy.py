from sqlalchemy import select

from backend.app.features.classification import service as classification
from backend.app.features.ledger import transactions_router as transactions_api
from backend.app.features.ledger.models import Account, Transaction, TransactionSplit
from backend.app.features.ledger.schemas import TransactionSplitCreate
from backend.app.features.settings.service import set_setting
from backend.app.features.taxonomy import categories_router as categories_api
from backend.app.features.taxonomy import service as budget_buckets
from backend.app.features.taxonomy.models import Category
from backend.tests.utils import make_session


def _make_account(session, name: str = "Checking", currency: str = "USD") -> Account:
    account = Account(
        name=name,
        type="checking",
        currency=currency,
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2026-03-09T00:00:00+00:00",
        updated_at="2026-03-09T00:00:00+00:00",
    )
    session.add(account)
    session.flush()
    return account


def _make_transaction(
    session,
    account_id: int,
    description: str,
    amount: float,
    currency: str = "USD",
    payee: str | None = None,
) -> Transaction:
    txn = Transaction(
        account_id=account_id,
        date="2026-03-09",
        description=description,
        amount=amount,
        currency=currency,
        payee=payee,
        notes=None,
        classification="Personal",
        reconciliation_state="imported",
        created_at="2026-03-09T00:00:00+00:00",
        updated_at="2026-03-09T00:00:00+00:00",
    )
    session.add(txn)
    session.flush()
    return txn


def test_ensure_category_collapses_legacy_detail_to_broad_name():
    session = make_session()

    category_id = classification._ensure_category(session, "Groceries")
    category = session.execute(select(Category).where(Category.id == category_id)).scalar_one()

    assert category.name == "Food"
    assert session.execute(select(Category).where(Category.name == "Groceries")).scalar_one_or_none() is None


def test_bank_category_and_local_ai_response_use_broad_taxonomy(monkeypatch):
    session = make_session()
    account = _make_account(session)
    set_setting(session, "local_ai_enabled", "true")
    session.commit()

    assert classification._format_bank_category("TRANSPORTATION_TAXIS_AND_RIDE_SHARES") == "Transport"

    monkeypatch.setattr(classification, "_local_ai_call", lambda _session, prompt: {
        "category": "Restaurants & Cafes",
        "classification": "Personal",
        "merchant_name": "Cafe Example",
        "note": "Legacy category collapsed to broad food bucket.",
    })

    result = classification.classify_payload(
        session,
        {
            "account_id": account.id,
            "date": "2026-03-09",
            "amount": -12.5,
            "currency": "USD",
            "description": "Cafe Example",
            "payee": "",
            "notes": "",
        },
    )

    assert result["category_name"] == "Food"


def test_travel_categories_collapse_into_transport_bucket():
    session = make_session()

    category_id = classification._ensure_category(session, "Travel")
    category = session.execute(select(Category).where(Category.id == category_id)).scalar_one()

    assert category.name == "Transport"
    assert budget_buckets.budget_bucket_key_for_category("Travel") == "transport"


def test_manual_round_up_split_applies_to_matching_merchants():
    session = make_session()
    account = _make_account(session)
    savings_category_id = classification._ensure_category(session, "Savings")
    source_txn = _make_transaction(session, account.id, "Round Up", -1.25)
    matching_txn = _make_transaction(session, account.id, "Round Up", -0.75)
    session.commit()

    result = transactions_api.add_split(
        source_txn.id,
        TransactionSplitCreate(
            transaction_id=source_txn.id,
            category_id=savings_category_id,
            amount=-1.25,
            currency="USD",
            classification="Personal",
        ),
        session=session,
    )

    propagated = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == matching_txn.id)
    ).scalars().all()
    updated_matching = session.execute(select(Transaction).where(Transaction.id == matching_txn.id)).scalar_one()

    assert result["updated"] == 1
    assert len(propagated) == 1
    assert propagated[0].category_id == savings_category_id
    assert updated_matching.reconciliation_state == "verified"


def test_categories_api_defaults_to_active_only():
    session = make_session()
    session.add(
        Category(
            name="Active Category",
            personal_allowed=1,
            business_allowed=1,
            tax_code=None,
            is_active=1,
        )
    )
    session.add(
        Category(
            name="Inactive Category",
            personal_allowed=1,
            business_allowed=1,
            tax_code=None,
            is_active=0,
        )
    )
    session.commit()

    active_only = categories_api.list_categories(session=session)
    with_inactive = categories_api.list_categories(include_inactive=True, session=session)

    assert [row.name for row in active_only] == ["Active Category"]
    assert [row.name for row in with_inactive] == ["Active Category", "Inactive Category"]
