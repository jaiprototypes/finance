from io import BytesIO

from fastapi import HTTPException
from pypdf import PdfReader
from sqlalchemy import select

from backend.app.models import (
    Account,
    Category,
    Client,
    Invoice,
    InvoiceLineItem,
    InvoicePaymentLink,
    Project,
    Transaction,
    TransactionSplit,
)
from backend.app.api.business import (
    apply_payment_route,
    create_invoice_route,
    delete_client as delete_client_route,
    delete_invoice as delete_invoice_route,
    invoice_detail,
    invoice_pdf as invoice_pdf_route,
    send_invoice as send_invoice_route,
    update_invoice_route,
    update_invoice_status as update_invoice_status_route,
)
from backend.app.schemas import InvoiceCreate, InvoicePaymentApply, InvoiceSendRequest
from backend.app.services.settings import set_setting
from backend.app.services.invoice_tracking import auto_track_invoices, serialize_invoice
from backend.app.services.invoices import apply_payment
from backend.tests.utils import make_session


def test_invoice_payment_updates_status():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="AUD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2024-06-01T00:00:00+00:00",
        updated_at="2024-06-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    transaction = Transaction(
        account_id=account.id,
        date="2024-06-02",
        description="Invoice payment",
        amount=100.0,
        currency="AUD",
        payee="Client",
        notes=None,
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2024-06-02T00:00:00+00:00",
        updated_at="2024-06-02T00:00:00+00:00",
    )
    session.add(transaction)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-100",
        status="sent",
        issue_date="2024-06-01",
        due_date=None,
        currency="AUD",
        subtotal=100.0,
        tax=0.0,
        total=100.0,
        notes=None,
        created_at="2024-06-01T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    line = InvoiceLineItem(invoice_id=invoice.id, description="Work", quantity=1, unit_price=100.0, amount=100.0)
    session.add(line)
    session.commit()

    result = apply_payment(session, invoice.id, transaction_id=transaction.id, amount=100.0)
    session.commit()

    assert result["status"] == "paid"


def test_invoice_payment_marks_receipt_transaction_as_business():
    session = make_session()
    account = Account(
        name="Business Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2026-04-01T00:00:00+00:00",
        updated_at="2026-04-01T00:00:00+00:00",
    )
    category = Category(
        name="Income",
        personal_allowed=1,
        business_allowed=1,
        tax_code=None,
        is_active=1,
    )
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add_all([account, category, client])
    session.commit()

    transaction = Transaction(
        account_id=account.id,
        date="2026-04-21",
        description="Client invoice payment",
        amount=250.0,
        currency="USD",
        payee="Client",
        notes=None,
        classification="Personal",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2026-04-21T00:00:00+00:00",
        updated_at="2026-04-21T00:00:00+00:00",
    )
    session.add(transaction)
    session.flush()
    session.add(
        TransactionSplit(
            transaction_id=transaction.id,
            category_id=category.id,
            amount=250.0,
            currency="USD",
            classification="Personal",
            notes="Imported as income",
            business_percent=None,
        )
    )
    invoice = Invoice(
        client_id=client.id,
        number="INV-BIZ-001",
        status="sent",
        issue_date="2026-04-20",
        due_date=None,
        currency="USD",
        subtotal=250.0,
        tax=0.0,
        total=250.0,
        notes=None,
        created_at="2026-04-20T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    apply_payment(session, invoice.id, transaction_id=transaction.id, amount=250.0)
    session.commit()

    refreshed_txn = session.execute(select(Transaction).where(Transaction.id == transaction.id)).scalar_one()
    refreshed_split = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == transaction.id)
    ).scalar_one()

    assert refreshed_txn.classification == "Business"
    assert refreshed_split.classification == "Business"


def test_serialize_invoice_marks_overdue_when_balance_remains():
    session = make_session()
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-OVERDUE",
        status="sent",
        issue_date="2024-05-01",
        due_date="2024-05-15",
        currency="USD",
        subtotal=300.0,
        tax=0.0,
        total=300.0,
        notes=None,
        created_at="2024-05-01T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    payload = serialize_invoice(session, invoice)

    assert payload["balance_due"] == 300.0
    assert payload["is_overdue"] is True
    assert payload["days_overdue"] > 0
    assert payload["tracking_state"] == "overdue"


def test_auto_track_invoices_applies_unique_exact_receipt():
    session = make_session()
    account = Account(
        name="Business checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(
        name="Example Energy Engineering LLC",
        email=None,
        phone=None,
        address=None,
        notes="Primary contact: Example Client",
        is_active=1,
    )
    session.add(client)
    session.commit()

    transaction = Transaction(
        account_id=account.id,
        date="2025-06-24",
        description="Web Branch:MLink from Example Client",
        amount=500.0,
        currency="USD",
        payee="Example Client",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-06-24T00:00:00+00:00",
        updated_at="2025-06-24T00:00:00+00:00",
    )
    session.add(transaction)
    invoice = Invoice(
        client_id=client.id,
        number="INV-AUTO-001",
        status="sent",
        issue_date="2025-06-20",
        due_date="2025-07-20",
        currency="USD",
        subtotal=500.0,
        tax=0.0,
        total=500.0,
        notes="Solution development hours",
        created_at="2025-06-20T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    tracking = auto_track_invoices(session, [invoice.id])
    session.commit()

    refreshed = session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one()
    payload = serialize_invoice(session, refreshed)
    assert tracking["auto_applied"] == 1
    assert payload["status"] == "paid"
    assert payload["paid_total"] == 500.0
    assert payload["balance_due"] == 0.0


def test_auto_track_invoices_prefers_gould_mlink_receipt_within_seven_days():
    session = make_session()
    account = Account(
        name="Business checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(
        name="Example Energy Engineering LLC",
        email=None,
        phone=None,
        address=None,
        notes="Primary contact: Example Client",
        is_active=1,
    )
    session.add(client)
    session.commit()

    early_mlink = Transaction(
        account_id=account.id,
        date="2025-06-24",
        description="Web Branch:MLink from Example Client",
        amount=500.0,
        currency="USD",
        payee="Example Client",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-06-24T00:00:00+00:00",
        updated_at="2025-06-24T00:00:00+00:00",
    )
    late_receipt = Transaction(
        account_id=account.id,
        date="2025-08-24",
        description="ACH credit from Example Client",
        amount=500.0,
        currency="USD",
        payee="Example Client",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-08-24T00:00:00+00:00",
        updated_at="2025-08-24T00:00:00+00:00",
    )
    session.add(early_mlink)
    session.add(late_receipt)
    invoice = Invoice(
        client_id=client.id,
        number="INV-AUTO-MLINK-001",
        status="sent",
        issue_date="2025-06-20",
        due_date="2025-07-20",
        currency="USD",
        subtotal=500.0,
        tax=0.0,
        total=500.0,
        notes="Solution development hours",
        created_at="2025-06-20T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    tracking = auto_track_invoices(session, [invoice.id])
    session.commit()

    payment_link = session.execute(select(InvoicePaymentLink)).scalar_one()
    payload = serialize_invoice(session, session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one())

    assert tracking["auto_applied"] == 1
    assert payment_link.transaction_id == early_mlink.id
    assert payload["status"] == "paid"
    assert payload["balance_due"] == 0.0


def test_auto_track_invoices_keeps_gould_mlink_matches_manual_when_two_fit_window():
    session = make_session()
    account = Account(
        name="Business checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(
        name="Example Energy Engineering LLC",
        email=None,
        phone=None,
        address=None,
        notes="Primary contact: Example Client",
        is_active=1,
    )
    session.add(client)
    session.commit()

    session.add(
        Transaction(
            account_id=account.id,
            date="2025-06-24",
            description="Web Branch:MLink from Example Client",
            amount=500.0,
            currency="USD",
            payee="Example Client",
            notes="Statement import",
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2025-06-24T00:00:00+00:00",
            updated_at="2025-06-24T00:00:00+00:00",
        )
    )
    session.add(
        Transaction(
            account_id=account.id,
            date="2025-06-26",
            description="Web Branch:MLink from Example Client",
            amount=500.0,
            currency="USD",
            payee="Example Client",
            notes="Statement import",
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2025-06-26T00:00:00+00:00",
            updated_at="2025-06-26T00:00:00+00:00",
        )
    )
    invoice = Invoice(
        client_id=client.id,
        number="INV-AUTO-MLINK-002",
        status="sent",
        issue_date="2025-06-20",
        due_date="2025-07-20",
        currency="USD",
        subtotal=500.0,
        tax=0.0,
        total=500.0,
        notes="Solution development hours",
        created_at="2025-06-20T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    tracking = auto_track_invoices(session, [invoice.id])
    session.commit()

    payload = serialize_invoice(session, session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one())

    assert tracking["auto_applied"] == 0
    assert payload["status"] == "sent"
    assert payload["balance_due"] == 500.0


def test_auto_track_invoices_skips_ambiguous_same_amount_receipts():
    session = make_session()
    account = Account(
        name="Business checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-07-01T00:00:00+00:00",
        updated_at="2025-07-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(
        name="Example Client.",
        email=None,
        phone=None,
        address=None,
        notes="Alias: Fused Consulting",
        is_active=1,
    )
    session.add(client)
    session.commit()

    transaction = Transaction(
        account_id=account.id,
        date="2025-07-04",
        description="Zelle Example Client LLC 800-533-6773",
        amount=1500.0,
        currency="USD",
        payee="Fused Consulting",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-07-04T00:00:00+00:00",
        updated_at="2025-07-04T00:00:00+00:00",
    )
    session.add(transaction)
    session.add(
        Invoice(
            client_id=client.id,
            number="INV-AMB-001",
            status="sent",
            issue_date="2025-07-01",
            due_date="2025-07-15",
            currency="USD",
            subtotal=1500.0,
            tax=0.0,
            total=1500.0,
            notes=None,
            created_at="2025-07-01T00:00:00+00:00",
        )
    )
    session.add(
        Invoice(
            client_id=client.id,
            number="INV-AMB-002",
            status="sent",
            issue_date="2025-07-02",
            due_date="2025-07-16",
            currency="USD",
            subtotal=1500.0,
            tax=0.0,
            total=1500.0,
            notes=None,
            created_at="2025-07-02T00:00:00+00:00",
        )
    )
    session.commit()

    tracking = auto_track_invoices(session)
    session.commit()

    invoices = session.execute(select(Invoice).order_by(Invoice.id.asc())).scalars().all()
    assert tracking["auto_applied"] == 0
    assert [serialize_invoice(session, invoice)["balance_due"] for invoice in invoices] == [1500.0, 1500.0]


def test_create_invoice_route_supports_agreed_total_lower_than_line_item_subtotal():
    session = make_session()
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    payload = InvoiceCreate(
        client_id=client.id,
        number="INV-AGREED-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        notes="Agreed fixed-fee invoice",
        agreed_total=350.0,
        line_items=[
            {"description": "Implementation", "quantity": 5, "unit_price": 100},
        ],
    )

    result = create_invoice_route(payload, session=session)

    assert result["subtotal"] == 500.0
    assert result["total"] == 350.0
    assert result["adjustment"] == -150.0


def test_update_invoice_route_rejects_total_below_linked_payments():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2026-04-24T00:00:00+00:00",
        updated_at="2026-04-24T00:00:00+00:00",
    )
    session.add(account)
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-AGREED-002",
        status="sent",
        issue_date="2026-04-24",
        due_date="2026-05-01",
        currency="USD",
        subtotal=200.0,
        tax=0.0,
        total=200.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Implementation", quantity=2, unit_price=100.0, amount=200.0))
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-04-25",
            description="Invoice payment",
            amount=120.0,
            currency="USD",
            payee="Client",
            notes=None,
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2026-04-25T00:00:00+00:00",
            updated_at="2026-04-25T00:00:00+00:00",
        )
    )
    session.commit()
    transaction = session.execute(select(Transaction)).scalar_one()
    apply_payment(session, invoice.id, transaction_id=transaction.id, amount=120.0)
    session.commit()

    payload = InvoiceCreate(
        client_id=client.id,
        number=invoice.number,
        status="sent",
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        currency="USD",
        notes=None,
        agreed_total=90.0,
        line_items=[
            {"description": "Implementation", "quantity": 2, "unit_price": 100},
        ],
    )

    try:
        update_invoice_route(invoice.id, payload, session=session)
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail == "Invoice total cannot be lower than linked payments"


def test_invoice_detail_route_returns_serialized_line_items():
    session = make_session()
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-DETAIL-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=250.0,
        tax=0.0,
        total=250.0,
        notes="Preview",
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(
        InvoiceLineItem(invoice_id=invoice.id, description="Design work", quantity=1, unit_price=250.0, amount=250.0)
    )
    session.commit()

    payload = invoice_detail(invoice.id, session=session)

    assert payload["line_items"] == [
        {
            "id": session.execute(select(InvoiceLineItem.id).where(InvoiceLineItem.invoice_id == invoice.id)).scalar_one(),
            "description": "Design work",
            "quantity": 1.0,
            "unit_price": 250.0,
            "amount": 250.0,
        }
    ]


def test_invoice_pdf_route_returns_pdf_response():
    session = make_session()
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-PDF-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=250.0,
        tax=0.0,
        total=250.0,
        notes="Preview",
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Design work", quantity=1, unit_price=250.0, amount=250.0))
    session.commit()

    response = invoice_pdf_route(invoice.id, session=session)

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"] == 'inline; filename="Invoice-INV-PDF-001.pdf"'
    assert response.headers["cache-control"] == "no-store, no-cache, max-age=0, must-revalidate"
    assert response.body.startswith(b"%PDF")


def test_invoice_pdf_route_preserves_long_line_item_content():
    session = make_session()
    client = Client(
        name="Example Energy Engineering LLC",
        email="billing@example.com",
        phone="608-555-0100",
        address="456 Sample Ave\nExample City, ST 00000",
        notes=None,
        is_active=1,
    )
    session.add(client)
    session.commit()
    set_setting(session, "company_name", "J.A.I.")
    set_setting(session, "company_legal_name", "Example Consulting LLC")
    set_setting(session, "company_email", "owner@example.com")
    set_setting(session, "company_phone", "+1 (608) 239-9980")
    set_setting(session, "company_address", "456 Sample Ave")
    set_setting(session, "company_city_state", "Example City, ST 00000")
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-PDF-002",
        status="draft",
        issue_date="2026-04-24",
        due_date="2026-05-01",
        currency="USD",
        subtotal=1564.0,
        tax=0.0,
        total=1564.0,
        notes="Draft review",
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(
        InvoiceLineItem(
            invoice_id=invoice.id,
            description=(
                "Windows desktop packaging, CI hardening, runtime persistence safeguards, "
                "and release workflow stabilization for local single-user delivery."
            ),
            quantity=29.0,
            unit_price=23.0,
            amount=667.0,
        )
    )
    session.add(
        InvoiceLineItem(
            invoice_id=invoice.id,
            description="Semantic retrieval, QA/search integration, canonical project workflow refactor.",
            quantity=29.0,
            unit_price=29.0,
            amount=897.0,
        )
    )
    session.commit()

    response = invoice_pdf_route(invoice.id, session=session)

    reader = PdfReader(BytesIO(response.body))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)

    assert "INV-PDF-002" in text
    assert "Windows desktop packaging" in text
    assert "runtime persistence" in text
    assert "workflow stabilization" in text
    assert "Semantic retrieval" in text
    assert "1,564.00 USD" in text or "1564.00 USD" in text


def test_invoice_pdf_route_omits_dba_and_tax_id_from_company_identity():
    session = make_session()
    client = Client(
        name="Client",
        email="billing@example.com",
        phone=None,
        address="123 Main St\nExample City, ST 00000",
        notes=None,
        is_active=1,
    )
    session.add(client)
    session.commit()
    set_setting(session, "company_name", "J.A.I.")
    set_setting(session, "company_legal_name", "Example Consulting LLC")
    set_setting(session, "company_dba", "J-A-I")
    set_setting(session, "company_entity_type", "Single-member LLC")
    set_setting(session, "company_tax_id", "42-1999652")
    set_setting(session, "company_email", "owner@example.com")
    set_setting(session, "company_phone", "+1 (608) 239-9980")
    set_setting(session, "company_address", "456 Sample Ave")
    set_setting(session, "company_city_state", "Example City, ST 00000")
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-PDF-003",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=250.0,
        tax=0.0,
        total=250.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(
        InvoiceLineItem(invoice_id=invoice.id, description="Retainer billing", quantity=1, unit_price=250.0, amount=250.0)
    )
    session.commit()

    response = invoice_pdf_route(invoice.id, session=session)

    reader = PdfReader(BytesIO(response.body))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)

    assert "Example Consulting LLC" in text
    assert "Single-member LLC" not in text
    assert "DBA" not in text
    assert "Tax ID" not in text
    assert "42-1999652" not in text
    assert "SUMMARY" not in text


def test_invoice_pdf_route_shows_adjustment_when_total_differs_from_subtotal():
    session = make_session()
    client = Client(
        name="Client",
        email="billing@example.com",
        phone=None,
        address="123 Main St\nExample City, ST 00000",
        notes=None,
        is_active=1,
    )
    session.add(client)
    session.commit()
    set_setting(session, "company_name", "J.A.I.")
    set_setting(session, "company_legal_name", "Example Consulting LLC")
    set_setting(session, "company_email", "owner@example.com")
    set_setting(session, "company_phone", "+1 (608) 239-9980")
    set_setting(session, "company_address", "456 Sample Ave")
    set_setting(session, "company_city_state", "Example City, ST 00000")
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-PDF-ADJUST-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=500.0,
        tax=0.0,
        total=350.0,
        notes="Agreed payable amount",
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(
        InvoiceLineItem(invoice_id=invoice.id, description="Implementation", quantity=5, unit_price=100.0, amount=500.0)
    )
    session.commit()

    response = invoice_pdf_route(invoice.id, session=session)

    reader = PdfReader(BytesIO(response.body))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)

    assert "Adjustment" in text
    assert "500.00 USD" in text
    assert "350.00 USD" in text


def test_apply_payment_route_returns_updated_invoice_payload():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2026-04-24T00:00:00+00:00",
        updated_at="2026-04-24T00:00:00+00:00",
    )
    session.add(account)
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-PAY-001",
        status="sent",
        issue_date="2026-04-24",
        due_date="2026-05-08",
        currency="USD",
        subtotal=180.0,
        tax=0.0,
        total=180.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Implementation", quantity=1, unit_price=180.0, amount=180.0))
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-04-25",
            description="Invoice payment",
            amount=180.0,
            currency="USD",
            payee="Client",
            notes=None,
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2026-04-25T00:00:00+00:00",
            updated_at="2026-04-25T00:00:00+00:00",
        )
    )
    session.commit()
    transaction = session.execute(select(Transaction)).scalar_one()

    payload = apply_payment_route(
        invoice.id,
        InvoicePaymentApply(transaction_id=transaction.id, amount=180.0),
        session=session,
    )

    assert payload["status"] == "paid"
    assert payload["paid_total"] == 180.0
    assert payload["balance_due"] == 0.0


def test_update_invoice_status_route_persists_status():
    session = make_session()
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-STATUS-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=50.0,
        tax=0.0,
        total=50.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    result = update_invoice_status_route(invoice.id, "sent", session=session)

    assert result == {"status": "ok", "invoice_status": "sent"}
    assert session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one().status == "sent"


def test_send_invoice_route_marks_invoice_sent(monkeypatch):
    session = make_session()
    client = Client(name="Client", email="billing@example.com", phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-SEND-001",
        status="draft",
        issue_date="2026-04-24",
        due_date="2026-05-08",
        currency="USD",
        subtotal=120.0,
        tax=0.0,
        total=120.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Consulting", quantity=1, unit_price=120.0, amount=120.0))
    set_setting(session, "smtp_host", "smtp.example.com")
    set_setting(session, "smtp_port", "587")
    set_setting(session, "smtp_username", "sender@example.com")
    set_setting(session, "smtp_password", "secret")
    set_setting(session, "smtp_from_email", "sender@example.com")
    session.commit()

    sent = {}

    def fake_send(session_arg, invoice_arg, client_arg, pdf_bytes, recipient_email=None):
        sent["invoice_id"] = invoice_arg.id
        sent["recipient_email"] = recipient_email or client_arg.email
        sent["pdf_prefix"] = pdf_bytes[:4]

    monkeypatch.setattr("backend.app.api.business.send_invoice_email", fake_send)

    result = send_invoice_route(invoice.id, session=session)

    assert result == {"status": "sent"}
    refreshed = session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one()
    assert refreshed.status == "sent"
    assert sent == {
        "invoice_id": invoice.id,
        "recipient_email": "billing@example.com",
        "pdf_prefix": b"%PDF",
    }


def test_send_invoice_route_accepts_explicit_recipient_when_client_email_missing(monkeypatch):
    session = make_session()
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-SEND-002",
        status="draft",
        issue_date="2026-04-24",
        due_date="2026-05-08",
        currency="USD",
        subtotal=120.0,
        tax=0.0,
        total=120.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Consulting", quantity=1, unit_price=120.0, amount=120.0))
    set_setting(session, "smtp_host", "smtp.example.com")
    set_setting(session, "smtp_port", "587")
    set_setting(session, "smtp_username", "sender@example.com")
    set_setting(session, "smtp_password", "secret")
    set_setting(session, "smtp_from_email", "sender@example.com")
    session.commit()

    sent = {}

    def fake_send(session_arg, invoice_arg, client_arg, pdf_bytes, recipient_email=None):
        sent["invoice_id"] = invoice_arg.id
        sent["recipient_email"] = recipient_email
        sent["pdf_prefix"] = pdf_bytes[:4]

    monkeypatch.setattr("backend.app.api.business.send_invoice_email", fake_send)

    result = send_invoice_route(
        invoice.id,
        payload=InvoiceSendRequest(recipient_email="accounts@example.com"),
        session=session,
    )

    assert result == {"status": "sent"}
    refreshed = session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one()
    assert refreshed.status == "sent"
    assert sent == {
        "invoice_id": invoice.id,
        "recipient_email": "accounts@example.com",
        "pdf_prefix": b"%PDF",
    }


def test_delete_client_route_removes_empty_duplicate():
    session = make_session()
    client = Client(
        name="Duplicate Client",
        email=None,
        phone=None,
        address=None,
        notes="No linked records",
        is_active=1,
    )
    session.add(client)
    session.commit()

    result = delete_client_route(client.id, session=session)

    assert result == {"status": "deleted"}
    assert session.execute(select(Client).where(Client.id == client.id)).scalar_one_or_none() is None


def test_delete_client_route_archives_client_with_invoices():
    session = make_session()
    client = Client(name="Active Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-CLIENT-001",
        status="draft",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=100.0,
        tax=0.0,
        total=100.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()

    result = delete_client_route(client.id, session=session)

    assert result["status"] == "archived"
    assert result["dependencies"] == {"projects": 0, "live_invoices": 1, "archived_invoices": 0}
    refreshed = session.execute(select(Client).where(Client.id == client.id)).scalar_one()
    assert refreshed.is_active == 0


def test_delete_client_route_archives_client_with_projects():
    session = make_session()
    client = Client(name="Project Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    project = Project(name="Desktop delivery", client_id=client.id, hourly_rate=120.0, tags=None, is_active=1)
    session.add(project)
    session.commit()

    result = delete_client_route(client.id, session=session)

    assert result["status"] == "archived"
    assert result["dependencies"] == {"projects": 1, "live_invoices": 0, "archived_invoices": 0}
    refreshed = session.execute(select(Client).where(Client.id == client.id)).scalar_one()
    assert refreshed.is_active == 0


def test_delete_invoice_route_removes_invoice_children():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2026-04-24T00:00:00+00:00",
        updated_at="2026-04-24T00:00:00+00:00",
    )
    session.add(account)
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-DEL-001",
        status="sent",
        issue_date="2026-04-24",
        due_date=None,
        currency="USD",
        subtotal=100.0,
        tax=0.0,
        total=100.0,
        notes=None,
        created_at="2026-04-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.commit()
    session.add(InvoiceLineItem(invoice_id=invoice.id, description="Work", quantity=1, unit_price=100.0, amount=100.0))
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-04-25",
            description="Invoice payment",
            amount=100.0,
            currency="USD",
            payee="Client",
            notes=None,
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2026-04-25T00:00:00+00:00",
            updated_at="2026-04-25T00:00:00+00:00",
        )
    )
    session.commit()
    transaction = session.execute(select(Transaction)).scalar_one()
    apply_payment(session, invoice.id, transaction_id=transaction.id, amount=100.0)
    session.commit()

    result = delete_invoice_route(invoice.id, session=session)

    assert result == {"status": "ok"}
    assert session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one_or_none() is None
    assert session.execute(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id)).first() is None
    assert session.execute(select(InvoicePaymentLink).where(InvoicePaymentLink.invoice_id == invoice.id)).first() is None
