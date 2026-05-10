from fpdf import FPDF
from sqlalchemy import select

from backend.app.models import Account, ArchivedInvoice, Client, Invoice, InvoiceLineItem, Transaction
from backend.app.services.archived_invoices import (
    apply_archived_invoice_payment,
    archived_invoice_detail,
    create_archived_invoice_from_upload,
    ensure_client,
    parse_invoice_text,
    serialize_archived_invoice,
    update_archived_invoice,
)
from backend.app.services.invoice_tracking import auto_track_archived_invoices, auto_track_receivables
from backend.tests.utils import make_session


def _make_pdf_bytes(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    for line in lines:
        pdf.multi_cell(0, 8, line)
    output = pdf.output()
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return output.encode("latin-1")


def test_upload_archived_invoice_creates_client_and_record():
    session = make_session()
    payload = _make_pdf_bytes(["Historical invoice"])

    record = create_archived_invoice_from_upload(
        session,
        file_bytes=payload,
        original_name="historical.pdf",
        mime_type="application/pdf",
        client_name="Acme Consulting LLC",
        number="INV-HIST-001",
        issue_date="2025-03-07",
        due_date="2025-04-06",
        currency="USD",
        total=300.0,
        status="paid",
        notes="Imported from legacy records",
    )
    session.commit()

    assert record.number == "INV-HIST-001"
    assert record.status == "paid"
    assert record.currency == "USD"
    assert record.total == 300.0

    stored_client = session.execute(
        select(Client).where(Client.name == "Acme Consulting LLC")
    ).scalar_one()
    stored_invoice = session.execute(select(ArchivedInvoice)).scalar_one()
    assert stored_invoice.client_id == stored_client.id
    assert stored_invoice.file_name == "historical.pdf"


def test_upload_archived_invoice_rejects_duplicate_pdf():
    session = make_session()
    payload = _make_pdf_bytes(["Duplicate archive"])
    create_archived_invoice_from_upload(
        session,
        file_bytes=payload,
        original_name="duplicate.pdf",
        mime_type="application/pdf",
        client_name="Acme Consulting LLC",
        number="INV-HIST-002",
        issue_date="2025-03-07",
        currency="USD",
        total=120.0,
    )
    session.commit()

    try:
        create_archived_invoice_from_upload(
            session,
            file_bytes=payload,
            original_name="duplicate.pdf",
            mime_type="application/pdf",
            client_name="Acme Consulting LLC",
            number="INV-HIST-002",
            issue_date="2025-03-07",
            currency="USD",
            total=120.0,
        )
    except FileExistsError as exc:
        assert "already been imported" in str(exc)
    else:
        raise AssertionError("Expected duplicate archived invoice upload to fail")


def test_parse_invoice_text_extracts_client_dates_and_total():
    sample = """
    INVOICE
    Bill to                                                       Ship to
    Example Client                                                  Example Client
    Example Energy Engineering LLC                       Example Energy Engineering LLC
    456 Sample Ave                                                  456 Sample Ave
    Example City, ST 00000                                             Example City, ST 00000
    United States                                                 United States

    Invoice details
    Invoice no.: 10
    Terms: Due on receipt
    Invoice date: 07/18/2025
    Due date: 07/18/2025

    #       Product or service                    Description                                   Qty      Rate      Amount
    1.      Solution Development Hours            (06/23 - 06/29)                                   9   $50.00    $450.00
    2.      Office Space                                                                            1  $150.00    $150.00
    """

    parsed = parse_invoice_text(sample)

    assert parsed["client_name"] == "Example Energy Engineering LLC"
    assert parsed["client_address"] == "456 Sample Ave\nExample City, ST 00000\nUnited States"
    assert parsed["client_notes"] == "Primary contact: Example Client"
    assert parsed["number"] == "10"
    assert parsed["issue_date"] == "2025-07-18"
    assert parsed["due_date"] == "2025-07-18"
    assert parsed["total"] == 600.0


def test_ensure_client_reuses_matching_contact_and_address_client():
    session = make_session()
    existing = Client(
        name="Example Energy Engineering LLC",
        email=None,
        phone=None,
        address="456 Sample Ave\nExample City, ST 00000\nUnited States",
        notes="Primary contact: Example Client",
        is_active=1,
    )
    session.add(existing)
    session.commit()

    record = ensure_client(
        session,
        client_name="Example Energy Consulting Group LLC",
        address="456 Sample Ave\nExample City, ST 00000\nUnited States",
        notes="Primary contact: Example Client",
    )
    session.commit()

    assert record.id == existing.id
    refreshed = session.execute(select(Client).where(Client.id == existing.id)).scalar_one()
    assert "Alias: Example Energy Consulting Group LLC" in (refreshed.notes or "")


def test_apply_archived_invoice_payment_updates_status_and_balance():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    session.commit()

    payload = _make_pdf_bytes(["Historical invoice"])
    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=payload,
        original_name="historical-payment.pdf",
        mime_type="application/pdf",
        client_name="Example Energy Engineering LLC",
        number="INV-HIST-010",
        issue_date="2025-06-13",
        due_date="2025-07-23",
        currency="USD",
        total=300.0,
        status="sent",
        notes="Primary contact: Example Client",
    )
    session.commit()

    transaction = Transaction(
        account_id=account.id,
        date="2025-06-24",
        description="Web Branch:MLink from Example Client",
        amount=200.0,
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
    session.commit()

    result = apply_archived_invoice_payment(session, archive.id, transaction.id, 200.0)
    session.commit()

    assert result["status"] == "partial"
    assert result["paid_total"] == 200.0
    assert result["balance_due"] == 100.0


def test_update_archived_invoice_recomputes_balance_and_status():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    session.commit()

    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-edit.pdf",
        mime_type="application/pdf",
        client_name="Example Energy Engineering LLC",
        number="INV-HIST-011",
        issue_date="2025-07-18",
        due_date="2025-07-18",
        currency="USD",
        total=400.0,
        status="sent",
        notes="Primary contact: Example Client",
    )
    transaction = Transaction(
        account_id=account.id,
        date="2025-07-25",
        description="Web Branch:MLink from Example Client",
        amount=250.0,
        currency="USD",
        payee="Example Client",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-07-25T00:00:00+00:00",
        updated_at="2025-07-25T00:00:00+00:00",
    )
    session.add(transaction)
    session.commit()

    apply_archived_invoice_payment(session, archive.id, transaction.id, 250.0)
    update_archived_invoice(
        session,
        archive.id,
        {
            "client_id": archive.client_id,
            "number": "INV-HIST-011",
            "status": "sent",
            "issue_date": "2025-07-18",
            "due_date": "2025-07-18",
            "currency": "USD",
            "total": 250.0,
            "notes": "Adjusted to final billed amount",
        },
    )
    session.commit()

    refreshed = session.execute(select(ArchivedInvoice).where(ArchivedInvoice.id == archive.id)).scalar_one()
    assert refreshed.status == "paid"
    assert refreshed.notes == "Adjusted to final billed amount"


def test_archived_invoice_detail_prioritizes_matching_contact_receipt():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    session.commit()

    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-match.pdf",
        mime_type="application/pdf",
        client_name="Example Energy Engineering LLC",
        number="INV-HIST-012",
        issue_date="2025-06-13",
        due_date="2025-07-23",
        currency="USD",
        total=200.0,
        status="sent",
        notes="Primary contact: Example Client",
    )
    session.add_all(
        [
            Transaction(
                account_id=account.id,
                date="2025-06-24",
                description="Web Branch:MLink from Example Client",
                amount=200.0,
                currency="USD",
                payee="Example Client",
                notes=None,
                classification="Business",
                reconciliation_state="verified",
                import_batch_id=None,
                created_at="2025-06-24T00:00:00+00:00",
                updated_at="2025-06-24T00:00:00+00:00",
            ),
            Transaction(
                account_id=account.id,
                date="2025-06-24",
                description="Incoming transfer",
                amount=200.0,
                currency="USD",
                payee="Someone Else",
                notes=None,
                classification="Business",
                reconciliation_state="verified",
                import_batch_id=None,
                created_at="2025-06-24T00:00:00+00:00",
                updated_at="2025-06-24T00:00:00+00:00",
            ),
        ]
    )
    session.commit()

    detail = archived_invoice_detail(session, archive)

    assert detail["candidate_transactions"][0]["description"] == "Web Branch:MLink from Example Client"
    assert "Matches Example Client" in detail["candidate_transactions"][0]["match_reason"]


def test_live_invoice_payment_rejects_transaction_fully_allocated_to_historical_invoice():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-06-01T00:00:00+00:00",
        updated_at="2025-06-01T00:00:00+00:00",
    )
    session.add(account)
    client = Client(name="Client", email=None, phone=None, address=None, notes=None, is_active=1)
    session.add(client)
    session.commit()

    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-allocated.pdf",
        mime_type="application/pdf",
        client_id=client.id,
        number="INV-HIST-013",
        issue_date="2025-06-13",
        due_date="2025-07-23",
        currency="USD",
        total=100.0,
        status="sent",
        notes="Primary contact: Example Client",
    )
    transaction = Transaction(
        account_id=account.id,
        date="2025-06-24",
        description="Web Branch:MLink from Example Client",
        amount=100.0,
        currency="USD",
        payee="Example Client",
        notes=None,
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-06-24T00:00:00+00:00",
        updated_at="2025-06-24T00:00:00+00:00",
    )
    session.add(transaction)
    session.commit()

    apply_archived_invoice_payment(session, archive.id, transaction.id, 100.0)
    session.commit()

    invoice = Invoice(
        client_id=client.id,
        number="INV-TEST-100",
        status="sent",
        issue_date="2025-06-24",
        due_date=None,
        currency="USD",
        subtotal=100.0,
        tax=0.0,
        total=100.0,
        notes=None,
        created_at="2025-06-24T00:00:00+00:00",
    )
    session.add(invoice)
    session.flush()
    session.add(
        InvoiceLineItem(
            invoice_id=invoice.id,
            description="Work",
            quantity=1,
            unit_price=100.0,
            amount=100.0,
        )
    )
    session.commit()

    from backend.app.services.invoices import apply_payment

    try:
        apply_payment(session, invoice.id, transaction.id, 100.0)
    except ValueError as exc:
        assert "unallocated transaction amount" in str(exc)
    else:
        raise AssertionError("Expected payment allocation guard to reject fully allocated transaction")


def test_serialize_archived_invoice_marks_overdue_state():
    session = make_session()
    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-overdue.pdf",
        mime_type="application/pdf",
        client_name="Acme Consulting LLC",
        number="INV-HIST-014",
        issue_date="2024-04-01",
        due_date="2024-04-15",
        currency="USD",
        total=425.0,
        status="archived",
        notes=None,
    )
    session.commit()

    payload = serialize_archived_invoice(session, archive)

    assert payload["balance_due"] == 425.0
    assert payload["is_overdue"] is True
    assert payload["days_overdue"] > 0
    assert payload["tracking_state"] == "overdue"


def test_auto_track_archived_invoices_applies_unique_exact_receipt():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-08-01T00:00:00+00:00",
        updated_at="2025-08-01T00:00:00+00:00",
    )
    session.add(account)
    session.commit()

    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-auto.pdf",
        mime_type="application/pdf",
        client_name="Example Energy Engineering LLC",
        number="INV-HIST-015",
        issue_date="2025-08-10",
        due_date="2025-08-20",
        currency="USD",
        total=600.0,
        status="archived",
        notes="Primary contact: Example Client",
    )
    transaction = Transaction(
        account_id=account.id,
        date="2025-08-14",
        description="Web Branch:MLink from Example Client",
        amount=600.0,
        currency="USD",
        payee="Example Client",
        notes="Statement import",
        classification="Business",
        reconciliation_state="verified",
        import_batch_id=None,
        created_at="2025-08-14T00:00:00+00:00",
        updated_at="2025-08-14T00:00:00+00:00",
    )
    session.add(transaction)
    session.commit()

    tracking = auto_track_archived_invoices(session, [archive.id])
    session.commit()

    refreshed = session.execute(select(ArchivedInvoice).where(ArchivedInvoice.id == archive.id)).scalar_one()
    payload = serialize_archived_invoice(session, refreshed)
    assert tracking["auto_applied"] == 1
    assert payload["status"] == "paid"
    assert payload["paid_total"] == 600.0
    assert payload["balance_due"] == 0.0


def test_auto_track_receivables_skips_cross_pool_receipt_conflict():
    session = make_session()
    account = Account(
        name="Checking",
        type="bank",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at="2025-09-01T00:00:00+00:00",
        updated_at="2025-09-01T00:00:00+00:00",
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

    archive = create_archived_invoice_from_upload(
        session,
        file_bytes=_make_pdf_bytes(["Historical invoice"]),
        original_name="historical-conflict.pdf",
        mime_type="application/pdf",
        client_id=client.id,
        number="INV-HIST-016",
        issue_date="2025-09-02",
        due_date="2025-09-16",
        currency="USD",
        total=1500.0,
        status="archived",
        notes="Alias: Fused Consulting",
    )
    invoice = Invoice(
        client_id=client.id,
        number="INV-LIVE-016",
        status="sent",
        issue_date="2025-09-03",
        due_date="2025-09-17",
        currency="USD",
        subtotal=1500.0,
        tax=0.0,
        total=1500.0,
        notes="Alias: Fused Consulting",
        created_at="2025-09-03T00:00:00+00:00",
    )
    session.add(invoice)
    session.flush()
    session.add(
        InvoiceLineItem(
            invoice_id=invoice.id,
            description="Work",
            quantity=1,
            unit_price=1500.0,
            amount=1500.0,
        )
    )
    session.add(
        Transaction(
            account_id=account.id,
            date="2025-09-04",
            description="Zelle Example Client LLC 800-533-6773",
            amount=1500.0,
            currency="USD",
            payee="Fused Consulting",
            notes="Statement import",
            classification="Business",
            reconciliation_state="verified",
            import_batch_id=None,
            created_at="2025-09-04T00:00:00+00:00",
            updated_at="2025-09-04T00:00:00+00:00",
        )
    )
    session.commit()

    tracking = auto_track_receivables(session)
    session.commit()

    refreshed_archive = session.execute(select(ArchivedInvoice).where(ArchivedInvoice.id == archive.id)).scalar_one()
    refreshed_invoice = session.execute(select(Invoice).where(Invoice.id == invoice.id)).scalar_one()
    archive_payload = serialize_archived_invoice(session, refreshed_archive)

    from backend.app.services.invoice_tracking import serialize_invoice

    live_payload = serialize_invoice(session, refreshed_invoice)
    assert tracking["auto_applied"] == 0
    assert archive_payload["balance_due"] == 1500.0
    assert live_payload["balance_due"] == 1500.0
