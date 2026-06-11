from backend.app.features.imports.service import create_import_batch, import_csv
from backend.app.features.ledger.models import Account
from backend.tests.utils import make_session


def test_import_idempotent():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="AUD",
        institution="Test",
        note="",
        is_active=1,
        created_at="2024-06-01T00:00:00+00:00",
        updated_at="2024-06-01T00:00:00+00:00",
    )
    session.add(account)
    session.commit()
    csv_data = b"Date,Description,Amount\n2024-06-01,Coffee,-4.50\n"
    mapping = {"date": "Date", "description": "Description", "amount": "Amount"}
    batch1 = create_import_batch(session, "csv", "bank.csv")
    result1 = import_csv(session, batch1, csv_data, mapping, account_id=account.id, default_currency="AUD")
    session.commit()

    batch2 = create_import_batch(session, "csv", "bank.csv")
    result2 = import_csv(session, batch2, csv_data, mapping, account_id=account.id, default_currency="AUD")
    session.commit()

    assert result1["imported"] == 1
    assert result2["duplicates"] == 1
