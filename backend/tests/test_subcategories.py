from datetime import datetime, timezone

from sqlalchemy import select

from backend.app.api import categories as categories_api
from backend.app.api import transactions as transactions_api
from backend.app.models import Account, Category, MerchantProfile, Subcategory, Transaction, TransactionSplit
from backend.app.schemas import SubcategoryCreate, TransactionSplitCreate, TransactionSplitUpdate
from backend.app.services import classification
from backend.app.services.subcategories import ensure_subcategory
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _make_account(session, currency: str = "AUD") -> Account:
    account = Account(
        name=f"{currency} Checking",
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


def _make_transaction(
    session,
    account_id: int,
    *,
    date: str,
    amount: float,
    currency: str,
    description: str,
    payee: str | None = None,
) -> Transaction:
    txn = Transaction(
        account_id=account_id,
        date=date,
        description=description,
        amount=amount,
        currency=currency,
        payee=payee,
        notes=None,
        classification="Personal",
        reconciliation_state="imported",
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(txn)
    session.flush()
    return txn


def test_manual_subcategory_assignment_updates_matching_historical_transactions_and_profile():
    session = make_session()
    account = _make_account(session, "AUD")
    transport = _make_category(session, "Transport")
    first = _make_transaction(
        session,
        account.id,
        date="2026-03-10",
        amount=-4.5,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    second = _make_transaction(
        session,
        account.id,
        date="2026-03-11",
        amount=-5.8,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    session.commit()

    result = transactions_api.add_split(
        second.id,
        TransactionSplitCreate(
            transaction_id=second.id,
            category_id=transport.id,
            subcategory_name="Train",
            amount=second.amount,
            currency=second.currency,
            classification="Personal",
        ),
        session,
    )

    train = ensure_subcategory(session, transport.id, "Train")
    splits = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id.in_([first.id, second.id]))
    ).scalars().all()
    profile = session.execute(select(MerchantProfile)).scalar_one()

    assert result["updated"] == 1
    assert len(splits) == 2
    assert {split.category_id for split in splits} == {transport.id}
    assert {split.subcategory_id for split in splits} == {train.id}
    assert profile.default_category_id == transport.id
    assert profile.default_subcategory_id == train.id


def test_matching_merchant_profile_applies_saved_subcategory_to_future_transactions():
    session = make_session()
    account = _make_account(session, "AUD")
    transport = _make_category(session, "Transport")
    train = ensure_subcategory(session, transport.id, "Train")
    session.add(
        MerchantProfile(
            name="Transperth",
            normalized_name=classification.normalize_merchant("Transperth"),
            currency="AUD",
            default_category_id=transport.id,
            default_subcategory_id=train.id,
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
            "date": "2026-03-12",
            "amount": -6.2,
            "currency": "AUD",
            "description": "Transperth Train Fare",
            "payee": "Transperth",
            "notes": "",
        },
    )
    txn = _make_transaction(
        session,
        account.id,
        date="2026-03-12",
        amount=-6.2,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    classification.apply_classification(session, txn.id, result)
    session.commit()

    split = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == txn.id)
    ).scalar_one()

    assert result["source"] == "merchant_profile"
    assert result["subcategory_id"] == train.id
    assert result["subcategory_name"] == "Train"
    assert split.subcategory_id == train.id


def test_categories_list_includes_nested_subcategories():
    session = make_session()
    transport = _make_category(session, "Transport")
    categories_api.create_subcategory(transport.id, SubcategoryCreate(name="Train"), session)

    categories = categories_api.list_categories(session=session)
    transport_row = next(category for category in categories if category.id == transport.id)

    assert len(transport_row.subcategories) == 1
    assert transport_row.subcategories[0].name == "Train"


def test_subcategory_can_be_renamed_within_same_category():
    session = make_session()
    transport = _make_category(session, "Transport")
    created = categories_api.create_subcategory(transport.id, SubcategoryCreate(name="Train"), session)

    renamed = categories_api.update_subcategory(created.id, SubcategoryCreate(name="Rail"), session)

    assert renamed.id == created.id
    assert renamed.name == "Rail"


def test_deleting_subcategory_clears_existing_split_and_profile_links():
    session = make_session()
    account = _make_account(session, "AUD")
    transport = _make_category(session, "Transport")
    train = ensure_subcategory(session, transport.id, "Train")
    txn = _make_transaction(
        session,
        account.id,
        date="2026-03-10",
        amount=-4.5,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    session.add(
        TransactionSplit(
            transaction_id=txn.id,
            category_id=transport.id,
            subcategory_id=train.id,
            amount=txn.amount,
            currency=txn.currency,
            classification="Personal",
            notes=None,
            business_percent=None,
        )
    )
    session.add(
        MerchantProfile(
            name="Transperth",
            normalized_name=classification.normalize_merchant("Transperth"),
            currency="AUD",
            default_category_id=transport.id,
            default_subcategory_id=train.id,
            default_classification="Personal",
            notes=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    result = categories_api.delete_subcategory(train.id, session)

    split = session.execute(select(TransactionSplit)).scalar_one()
    profile = session.execute(select(MerchantProfile)).scalar_one()
    assert result["status"] == "ok"
    assert result["cleared_splits"] == 1
    assert result["cleared_profiles"] == 1
    assert split.subcategory_id is None
    assert profile.default_subcategory_id is None
    assert session.execute(select(Subcategory).where(Subcategory.id == train.id)).scalar_one_or_none() is None


def test_updating_full_amount_split_to_subcategory_cascades_to_matching_merchants():
    session = make_session()
    account = _make_account(session, "AUD")
    transport = _make_category(session, "Transport")
    first = _make_transaction(
        session,
        account.id,
        date="2026-03-10",
        amount=-4.5,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    second = _make_transaction(
        session,
        account.id,
        date="2026-03-11",
        amount=-5.8,
        currency="AUD",
        description="Transperth Train Fare",
        payee="Transperth",
    )
    session.add_all(
        [
            TransactionSplit(
                transaction_id=first.id,
                category_id=transport.id,
                amount=first.amount,
                currency=first.currency,
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
            TransactionSplit(
                transaction_id=second.id,
                category_id=transport.id,
                amount=second.amount,
                currency=second.currency,
                classification="Personal",
                notes=None,
                business_percent=None,
            ),
        ]
    )
    session.commit()

    second_split = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == second.id)
    ).scalar_one()
    result = transactions_api.update_split(
        second_split.id,
        TransactionSplitUpdate(
            category_id=transport.id,
            subcategory_name="Train",
            classification="Personal",
        ),
        session,
    )

    train = ensure_subcategory(session, transport.id, "Train")
    splits = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id.in_([first.id, second.id]))
    ).scalars().all()
    profile = session.execute(select(MerchantProfile)).scalar_one()

    assert result["updated"] == 1
    assert {split.subcategory_id for split in splits} == {train.id}
    assert profile.default_subcategory_id == train.id
