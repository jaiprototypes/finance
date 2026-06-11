from datetime import datetime, timezone

from sqlalchemy import func, select

from backend.app.features.classification.models import ClassificationAudit, TransactionMemory
from backend.app.features.connectors import plaid_client
from backend.app.features.connectors.models import PlaidAccount, PlaidItem, PlaidTransaction
from backend.app.features.ledger.models import Account, Transaction, TransactionSplit
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _make_account(session, name: str, institution: str, currency: str = "USD") -> Account:
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


def _make_plaid_item(session, item_id: str, institution_name: str, status: str = "active") -> PlaidItem:
    item = PlaidItem(
        item_id=item_id,
        access_token=f"access-{item_id}",
        institution_id="ins_test",
        institution_name=institution_name,
        status=status,
        cursor=None,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(item)
    session.flush()
    return item


def _make_plaid_account(
    session,
    item_id: str,
    plaid_account_id: str,
    account_id: int,
    name: str = "Main Checking",
    official_name: str = "Checking Account",
    mask: str = "4803",
    currency: str = "USD",
    is_active: int = 1,
) -> PlaidAccount:
    account = PlaidAccount(
        item_id=item_id,
        plaid_account_id=plaid_account_id,
        account_id=account_id,
        name=name,
        official_name=official_name,
        type="depository",
        subtype="checking",
        mask=mask,
        currency=currency,
        is_active=is_active,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.flush()
    return account


def _make_transaction(
    session,
    account_id: int,
    date: str,
    amount: float,
    description: str,
    payee: str | None = None,
) -> Transaction:
    txn = Transaction(
        account_id=account_id,
        date=date,
        description=description,
        amount=amount,
        currency="USD",
        payee=payee,
        notes=None,
        classification="Personal",
        reconciliation_state="imported",
        import_batch_id=None,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(txn)
    session.flush()
    return txn


def test_create_update_link_token_uses_existing_item_with_account_selection(monkeypatch):
    session = make_session()
    item = _make_plaid_item(session, "item-1", "Sample Credit Union")
    captured = {}

    def fake_plaid_request(path, payload, timeout=20):
        captured["path"] = path
        captured["payload"] = payload
        return {"link_token": "link-update-token", "expiration": "2026-05-02T12:00:00Z"}

    monkeypatch.setattr(plaid_client, "plaid_request", fake_plaid_request)

    response = plaid_client.create_update_link_token(session, item.item_id)

    assert response["link_token"] == "link-update-token"
    assert response["item_id"] == item.item_id
    assert response["institution_name"] == "Sample Credit Union"
    assert captured["path"] == "/link/token/create"
    assert captured["payload"]["access_token"] == item.access_token
    assert captured["payload"]["update"] == {"account_selection_enabled": True}
    assert captured["payload"]["account_filters"] == {"depository": {"account_subtypes": ["checking"]}}
    assert "products" not in captured["payload"]


def test_create_update_link_token_returns_configured_redirect_uri(monkeypatch):
    session = make_session()
    item = _make_plaid_item(session, "item-1", "Sample Credit Union")

    def fake_plaid_request(path, payload, timeout=20):
        return {"link_token": "link-update-token", "expiration": "2026-05-02T12:00:00Z"}

    monkeypatch.setattr(plaid_client, "PLAID_REDIRECT_URI", "https://example.com/plaid/oauth")
    monkeypatch.setattr(plaid_client, "plaid_request", fake_plaid_request)

    response = plaid_client.create_update_link_token(session, item.item_id)

    assert response["redirect_uri"] == "https://example.com/plaid/oauth"


def test_sync_marks_item_login_required(monkeypatch):
    session = make_session()
    item = _make_plaid_item(session, "item-1", "Sample Credit Union")

    def fake_plaid_request(path, payload, timeout=20):
        raise plaid_client.PlaidRequestError(
            path,
            "user login is required",
            error_code="ITEM_LOGIN_REQUIRED",
            request_id="request-1",
        )

    monkeypatch.setattr(plaid_client, "plaid_request", fake_plaid_request)

    result = plaid_client.sync_transactions(session)

    assert result["errors"][0]["error_code"] == "ITEM_LOGIN_REQUIRED"
    assert item.status == "login_required"


def test_exchange_public_token_marks_duplicate_account_link(monkeypatch):
    session = make_session()

    responses = iter(
        [
            {"access_token": "access-1", "item_id": "item-1"},
            {
                "accounts": [
                    {
                        "account_id": "plaid-account-1",
                        "name": "Main Checking",
                        "official_name": "Checking Account",
                        "type": "depository",
                        "subtype": "checking",
                        "mask": "4803",
                        "balances": {"iso_currency_code": "USD"},
                    }
                ]
            },
            {"access_token": "access-2", "item_id": "item-2"},
            {
                "accounts": [
                    {
                        "account_id": "plaid-account-2",
                        "name": "Main Checking",
                        "official_name": "Checking Account",
                        "type": "depository",
                        "subtype": "checking",
                        "mask": "4803",
                        "balances": {"iso_currency_code": "USD"},
                    }
                ]
            },
        ]
    )

    monkeypatch.setattr(plaid_client, "plaid_request", lambda path, payload, timeout=20: next(responses))

    plaid_client.exchange_public_token(
        session,
        "public-1",
        {"institution": {"institution_id": "ins_1", "name": "Sample Credit Union"}},
    )
    plaid_client.exchange_public_token(
        session,
        "public-2",
        {"institution": {"institution_id": "ins_1", "name": "Sample Credit Union"}},
    )
    session.commit()

    local_accounts = session.execute(select(Account)).scalars().all()
    plaid_items = session.execute(select(PlaidItem).order_by(PlaidItem.id)).scalars().all()
    plaid_accounts = session.execute(select(PlaidAccount).order_by(PlaidAccount.id)).scalars().all()

    assert len(local_accounts) == 1
    assert [item.status for item in plaid_items] == ["active", "duplicate"]
    assert [account.account_id for account in plaid_accounts] == [local_accounts[0].id, local_accounts[0].id]
    assert [account.is_active for account in plaid_accounts] == [1, 0]


def test_deduplicate_plaid_links_collapses_strict_duplicate_subset():
    session = make_session()
    canonical_item = _make_plaid_item(session, "item-1", "Sample Credit Union")
    duplicate_item = _make_plaid_item(session, "item-2", "Sample Credit Union")
    canonical_account = _make_account(session, "Sample Credit Union Main Checking", "Sample Credit Union")
    duplicate_account = _make_account(session, "Sample Credit Union Main Checking", "Sample Credit Union")
    _make_plaid_account(session, canonical_item.item_id, "plaid-account-1", canonical_account.id)
    duplicate_mapping = _make_plaid_account(session, duplicate_item.item_id, "plaid-account-2", duplicate_account.id)

    canonical_txn = _make_transaction(
        session,
        canonical_account.id,
        "2026-03-06",
        844.85,
        "ACH:Sample User -WISE",
    )
    duplicate_txn = _make_transaction(
        session,
        duplicate_account.id,
        "2026-03-06",
        844.85,
        "ACH:Sample User -WISE",
    )
    session.add(
        PlaidTransaction(
            plaid_transaction_id="txn-1",
            pending_transaction_id=None,
            account_id=canonical_account.id,
            transaction_id=canonical_txn.id,
            amount=844.85,
            date="2026-03-06",
            name="ACH:Sample User -WISE",
            merchant_name="",
            merchant_category_code=None,
            pfc_primary=None,
            pfc_detailed=None,
            pending=0,
            created_at=_now_str(),
        )
    )
    session.add(
        PlaidTransaction(
            plaid_transaction_id="txn-2",
            pending_transaction_id=None,
            account_id=duplicate_account.id,
            transaction_id=duplicate_txn.id,
            amount=844.85,
            date="2026-03-06",
            name="ACH:Sample User -WISE",
            merchant_name="",
            merchant_category_code=None,
            pfc_primary=None,
            pfc_detailed=None,
            pending=0,
            created_at=_now_str(),
        )
    )
    session.add(
        TransactionSplit(
            transaction_id=canonical_txn.id,
            category_id=None,
            amount=844.85,
            currency="USD",
            classification="Personal",
            notes="Auto-classified",
            business_percent=None,
        )
    )
    session.add(
        TransactionSplit(
            transaction_id=duplicate_txn.id,
            category_id=None,
            amount=844.85,
            currency="USD",
            classification="Personal",
            notes="Auto-classified",
            business_percent=None,
        )
    )
    session.add(
        TransactionMemory(
            transaction_id=canonical_txn.id,
            merchant="Sample User",
            content="ACH:Sample User -WISE",
            category_id=None,
            classification="Personal",
            created_at=_now_str(),
        )
    )
    session.add(
        TransactionMemory(
            transaction_id=duplicate_txn.id,
            merchant="Sample User",
            content="ACH:Sample User -WISE duplicate",
            category_id=None,
            classification="Personal",
            created_at=_now_str(),
        )
    )
    session.add(
        ClassificationAudit(
            transaction_id=canonical_txn.id,
            source="transfer_fx_match",
            category_id=None,
            classification="Personal",
            merchant_name="Sample User",
            note="canonical",
            created_at=_now_str(),
        )
    )
    session.add(
        ClassificationAudit(
            transaction_id=duplicate_txn.id,
            source="transfer_fx_match",
            category_id=None,
            classification="Personal",
            merchant_name="Sample User",
            note="duplicate",
            created_at=_now_str(),
        )
    )
    session.commit()

    summary = plaid_client.deduplicate_plaid_links(session)
    session.commit()

    remaining_transactions = session.execute(
        select(Transaction).order_by(Transaction.id)
    ).scalars().all()
    duplicate_local = session.execute(
        select(Account).where(Account.id == duplicate_account.id)
    ).scalar_one()
    duplicate_item_row = session.execute(
        select(PlaidItem).where(PlaidItem.item_id == duplicate_item.item_id)
    ).scalar_one()
    duplicate_mapping_row = session.execute(
        select(PlaidAccount).where(PlaidAccount.id == duplicate_mapping.id)
    ).scalar_one()
    split_count = session.execute(
        select(func.count()).select_from(TransactionSplit).where(TransactionSplit.transaction_id == canonical_txn.id)
    ).scalar_one()
    memory_count = session.execute(
        select(func.count()).select_from(TransactionMemory).where(TransactionMemory.transaction_id == canonical_txn.id)
    ).scalar_one()
    audit_count = session.execute(
        select(func.count()).select_from(ClassificationAudit).where(ClassificationAudit.transaction_id == canonical_txn.id)
    ).scalar_one()

    assert summary["collapsed_accounts"] == 1
    assert summary["deleted_transactions"] == 1
    assert len(remaining_transactions) == 1
    assert remaining_transactions[0].account_id == canonical_account.id
    assert split_count == 1
    assert memory_count == 1
    assert audit_count == 1
    assert duplicate_local.is_active == 0
    assert duplicate_item_row.status == "duplicate"
    assert duplicate_mapping_row.account_id == canonical_account.id
    assert duplicate_mapping_row.is_active == 0
