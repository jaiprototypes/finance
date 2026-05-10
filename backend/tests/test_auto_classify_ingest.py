from datetime import datetime, timezone

from sqlalchemy import select

from backend.app.api import up as up_api
from backend.app.models import Account, Category, PlaidAccount, PlaidItem, PlaidTransaction, Transaction, TransactionSplit, UpAccount
from backend.app.services import plaid_client, up_client
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _make_account(session, name: str, institution: str, currency: str) -> Account:
    account = Account(
        name=name,
        type="bank",
        currency=currency,
        institution=institution,
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.flush()
    return account


def test_plaid_sync_auto_classifies_new_transactions(monkeypatch):
    session = make_session()
    account = _make_account(session, "Sample CU Checking", "Sample Credit Union", "USD")
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="access-1",
            institution_id="ins_1",
            institution_name="Sample Credit Union",
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
            account_id=account.id,
            name="Main Checking",
            official_name="Main Checking",
            type="depository",
            subtype="checking",
            mask="4803",
            currency="USD",
            is_active=1,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    monkeypatch.setattr(
        plaid_client,
        "plaid_request",
        lambda path, payload, timeout=20: {
            "added": [
                {
                    "transaction_id": "txn-1",
                    "pending_transaction_id": None,
                    "account_id": "plaid-account-1",
                    "amount": 5.0,
                    "name": "Round Up",
                    "merchant_name": "",
                    "date": "2026-03-01",
                    "pending": False,
                    "iso_currency_code": "USD",
                    "personal_finance_category": {},
                }
            ],
            "modified": [],
            "removed": [],
            "next_cursor": "cursor-1",
            "has_more": False,
        },
    )

    result = plaid_client.sync_transactions(session)

    txn = session.execute(select(Transaction)).scalar_one()
    split = session.execute(select(TransactionSplit)).scalar_one()
    category = session.execute(select(Category).where(Category.id == split.category_id)).scalar_one()

    assert result["added"] == 1
    assert txn.description == "Round Up"
    assert txn.reconciliation_state == "verified"
    assert split.transaction_id == txn.id
    assert split.amount == txn.amount
    assert category.name == "Savings"


def test_plaid_sync_discovers_new_checking_account_before_importing_transactions(monkeypatch):
    session = make_session()
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="access-1",
            institution_id="ins_1",
            institution_name="Sample Credit Union",
            status="active",
            cursor=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    def fake_plaid_request(path, payload, timeout=20):
        if path == "/accounts/balance/get":
            raise AssertionError("Normal Plaid sync should not require /accounts/balance/get")
        if path == "/accounts/get":
            return {
                "accounts": [
                    {
                        "account_id": "plaid-business-checking",
                        "name": "Business Checking",
                        "official_name": "Business Checking",
                        "type": "depository",
                        "subtype": "checking",
                        "mask": "8842",
                        "balances": {"current": 500.0, "available": 500.0, "iso_currency_code": "USD"},
                    }
                ]
            }
        if path == "/transactions/sync":
            return {
                "added": [
                    {
                        "transaction_id": "txn-business-payment-1",
                        "pending_transaction_id": None,
                        "account_id": "plaid-business-checking",
                        "amount": -500.0,
                        "name": "ACME invoice payment",
                        "merchant_name": "ACME LLC",
                        "date": "2026-04-20",
                        "pending": False,
                        "iso_currency_code": "USD",
                        "personal_finance_category": {},
                    }
                ],
                "modified": [],
                "removed": [],
                "next_cursor": "cursor-1",
                "has_more": False,
            }
        raise AssertionError(f"Unexpected Plaid path {path}")

    monkeypatch.setattr(plaid_client, "plaid_request", fake_plaid_request)

    result = plaid_client.sync_transactions(session)

    account = session.execute(select(Account)).scalar_one()
    plaid_account = session.execute(select(PlaidAccount)).scalar_one()
    txn = session.execute(select(Transaction)).scalar_one()

    assert result["accounts_created"] == 1
    assert result["added"] == 1
    assert "errors" not in result
    assert account.name == "Sample Credit Union Business Checking"
    assert plaid_account.account_id == account.id
    assert plaid_account.current_balance == 500.0
    assert txn.account_id == account.id
    assert txn.amount == 500.0
    assert txn.description == "ACME invoice payment"


def test_up_sync_auto_classifies_new_transactions(monkeypatch):
    session = make_session()
    account = _make_account(session, "Up Spending", "Up Bank", "AUD")
    session.add(
        UpAccount(
            up_account_id="up-account-1",
            account_id=account.id,
            name="Up Spending",
            account_type="TRANSACTIONAL",
            ownership_type="INDIVIDUAL",
            currency="AUD",
            is_active=1,
            last_synced_at=None,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    monkeypatch.setattr(up_client, "_get_categories_map", lambda: {})
    monkeypatch.setattr(
        up_client,
        "_get",
        lambda path, params=None: {
            "data": [
                {
                    "id": "up-txn-1",
                    "attributes": {
                        "amount": {"value": "-1.25", "currencyCode": "AUD"},
                        "description": "Round Up",
                        "message": "",
                        "status": "SETTLED",
                        "createdAt": "2026-03-01T00:00:00+00:00",
                        "rawText": "Round Up",
                    },
                    "relationships": {},
                }
            ],
            "links": {},
        },
    )

    result = up_client.sync_transactions(session)

    txn = session.execute(select(Transaction)).scalar_one()
    split = session.execute(select(TransactionSplit)).scalar_one()
    category = session.execute(select(Category).where(Category.id == split.category_id)).scalar_one()

    assert result["added"] == 1
    assert txn.description == "Round Up"
    assert txn.reconciliation_state == "verified"
    assert split.transaction_id == txn.id
    assert split.amount == txn.amount
    assert category.name == "Savings"


def test_up_sync_transactions_only_skips_account_refresh_when_accounts_exist(monkeypatch):
    session = make_session()
    account = _make_account(session, "Up Spending", "Up Bank", "AUD")
    session.add(
        UpAccount(
            up_account_id="up-account-1",
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

    calls = {"accounts": 0, "transactions": 0}

    monkeypatch.setattr(up_api, "is_configured", lambda: True)

    def fake_sync_accounts(_session):
        calls["accounts"] += 1
        return {"accounts": 1, "created": 0, "updated": 0}

    def fake_sync_transactions(_session, full=False):
        calls["transactions"] += 1
        return {"accounts": 1, "added": 2, "updated": 1}

    monkeypatch.setattr(up_api, "sync_accounts", fake_sync_accounts)
    monkeypatch.setattr(up_api, "sync_transactions", fake_sync_transactions)

    result = up_api.up_sync_transactions_only(session=session)

    assert calls["accounts"] == 0
    assert calls["transactions"] == 1
    assert result["accounts"] is None
    assert result["transactions"]["added"] == 2


def test_up_sync_transactions_only_bootstraps_accounts_when_missing(monkeypatch):
    session = make_session()
    calls = {"accounts": 0, "transactions": 0}

    monkeypatch.setattr(up_api, "is_configured", lambda: True)

    def fake_sync_accounts(_session):
        calls["accounts"] += 1
        return {"accounts": 1, "created": 1, "updated": 0}

    def fake_sync_transactions(_session, full=False):
        calls["transactions"] += 1
        return {"accounts": 1, "added": 0, "updated": 0}

    monkeypatch.setattr(up_api, "sync_accounts", fake_sync_accounts)
    monkeypatch.setattr(up_api, "sync_transactions", fake_sync_transactions)

    result = up_api.up_sync_transactions_only(session=session)

    assert calls["accounts"] == 1
    assert calls["transactions"] == 1
    assert result["accounts"]["created"] == 1
    assert result["transactions"]["accounts"] == 1


def test_plaid_sync_updates_single_full_amount_split_on_amount_change(monkeypatch):
    session = make_session()
    account = _make_account(session, "Sample CU Checking", "Sample Credit Union", "USD")
    category = Category(
        name="Savings",
        personal_allowed=1,
        business_allowed=1,
        tax_code=None,
        is_active=1,
    )
    session.add(category)
    session.add(
        PlaidItem(
            item_id="item-1",
            access_token="access-1",
            institution_id="ins_1",
            institution_name="Sample Credit Union",
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
            account_id=account.id,
            name="Main Checking",
            official_name="Main Checking",
            type="depository",
            subtype="checking",
            mask="4803",
            currency="USD",
            is_active=1,
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.flush()
    txn = Transaction(
        account_id=account.id,
        date="2026-03-01",
        description="Round Up",
        amount=-5.0,
        currency="USD",
        payee=None,
        notes="Plaid transaction txn-1",
        classification="Personal",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(txn)
    session.flush()
    session.add(
        TransactionSplit(
            transaction_id=txn.id,
            category_id=category.id,
            amount=-5.0,
            currency="USD",
            classification="Personal",
            notes="Auto-classified",
            business_percent=None,
        )
    )
    session.add(
        PlaidTransaction(
            plaid_transaction_id="txn-1",
            pending_transaction_id=None,
            account_id=account.id,
            transaction_id=txn.id,
            amount=-5.0,
            date="2026-03-01",
            name="Round Up",
            merchant_name="",
            merchant_category_code=None,
            pfc_primary=None,
            pfc_detailed=None,
            pending=1,
            created_at=_now_str(),
        )
    )
    session.commit()

    monkeypatch.setattr(
        plaid_client,
        "plaid_request",
        lambda path, payload, timeout=20: {
            "added": [
                {
                    "transaction_id": "txn-1",
                    "pending_transaction_id": None,
                    "account_id": "plaid-account-1",
                    "amount": 6.0,
                    "name": "Round Up",
                    "merchant_name": "",
                    "date": "2026-03-02",
                    "pending": False,
                    "iso_currency_code": "USD",
                    "personal_finance_category": {},
                }
            ],
            "modified": [],
            "removed": [],
            "next_cursor": "cursor-1",
            "has_more": False,
        },
    )

    plaid_client.sync_transactions(session)

    updated_txn = session.execute(select(Transaction).where(Transaction.id == txn.id)).scalar_one()
    updated_split = session.execute(select(TransactionSplit).where(TransactionSplit.transaction_id == txn.id)).scalar_one()

    assert updated_txn.amount == -6.0
    assert updated_txn.reconciliation_state == "verified"
    assert updated_split.amount == -6.0
