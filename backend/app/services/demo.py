from datetime import datetime, timezone

from sqlalchemy import text

from ..models import (
    Account,
    Category,
    Client,
    Project,
    Task,
    Transaction,
    Invoice,
    InvoiceLineItem,
    TimeEntry,
)


def seed_demo_data(session) -> dict:
    now = _now_str()
    checking = Account(name="Everyday Banking", type="bank", currency="AUD", institution="Demo Bank", note="", is_active=1, created_at=now, updated_at=now)
    credit = Account(name="Business Card", type="credit card", currency="AUD", institution="Demo Bank", note="", is_active=1, created_at=now, updated_at=now)
    session.add_all([checking, credit])
    session.flush()

    cat_food = Category(name="Food", personal_allowed=1, business_allowed=0, tax_code=None, is_active=1)
    cat_client = Category(name="Client Meals", personal_allowed=0, business_allowed=1, tax_code="MEALS", is_active=1)
    session.add_all([cat_food, cat_client])

    client = Client(name="Demo Client", email="client@example.com", phone=None, address=None, notes="", is_active=1)
    session.add(client)
    session.flush()

    project = Project(name="Website Refresh", client_id=client.id, hourly_rate=120.0, tags="design", is_active=1)
    session.add(project)
    session.flush()

    task = Task(project_id=project.id, name="Landing Page", is_active=1)
    session.add(task)

    txn = Transaction(
        account_id=checking.id,
        date="2024-06-01",
        description="Grocery store",
        amount=-85.20,
        currency="AUD",
        payee="Market",
        notes="",
        classification="Personal",
        reconciliation_state="cleared",
        import_batch_id=None,
        created_at=now,
        updated_at=now,
    )
    session.add(txn)

    invoice = Invoice(
        client_id=client.id,
        number="INV-0001",
        status="sent",
        issue_date="2024-06-05",
        due_date="2024-06-19",
        currency="AUD",
        subtotal=240.0,
        tax=0.0,
        total=240.0,
        notes="Thanks for your business",
        created_at=now,
    )
    session.add(invoice)
    session.flush()
    line = InvoiceLineItem(
        invoice_id=invoice.id,
        description="Design work",
        quantity=2,
        unit_price=120.0,
        amount=240.0,
    )
    session.add(line)

    time_entry = TimeEntry(
        project_id=project.id,
        task_id=task.id,
        date="2024-06-04",
        start_time="2024-06-04T09:00:00+00:00",
        end_time="2024-06-04T11:00:00+00:00",
        duration_minutes=120,
        notes="Hero section",
        billable=1,
        hourly_rate=120.0,
        invoiced_invoice_id=invoice.id,
        created_at=now,
    )
    session.add(time_entry)

    return {"accounts": 2, "categories": 2, "client": client.id, "project": project.id}


def reset_demo_data(session) -> dict:
    tables = [
        "archived_invoice_payment_link",
        "archived_invoice",
        "invoice_payment_link",
        "invoice_line_item",
        "invoice",
        "time_entry",
        "task",
        "project",
        "transactions",
        "client",
        "category",
        "account",
    ]
    for table in tables:
        session.execute(text(f"DELETE FROM {table}"))
    return {"cleared_tables": tables}


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()
