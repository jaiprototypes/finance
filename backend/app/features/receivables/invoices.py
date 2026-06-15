from dataclasses import dataclass
from datetime import datetime
import math
import re
from sqlalchemy import select, func

from .models import ArchivedInvoice, Invoice, InvoiceLineItem, InvoicePaymentLink
from .business_receivables import (
    compute_receivable_status,
    mark_transaction_as_business_receipt,
    transaction_available_amount,
)


def _normalize_number(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


_DEFAULT_DATE_NUMBER_RE = re.compile(r"^INV-\d{8}-\d+$")
_TRAILING_SEQUENCE_RE = re.compile(r"^(?P<prefix>.*?)(?P<sequence>\d+)$")


@dataclass(frozen=True)
class InvoiceNumberSequence:
    prefix: str
    value: int
    width: int


def _number_exists(session, number: str, exclude_id: int | None = None) -> bool:
    query = select(Invoice.id).where(Invoice.number == number)
    if exclude_id:
        query = query.where(Invoice.id != exclude_id)
    if session.execute(query).scalar_one_or_none() is not None:
        return True
    return session.execute(
        select(ArchivedInvoice.id).where(ArchivedInvoice.number == number)
    ).scalar_one_or_none() is not None


def _generate_number(session, issue_date: str | None) -> str:
    date_value = (issue_date or datetime.now().date().isoformat())[:10]
    prefix_date = date_value.replace("-", "")
    prefix = f"INV-{prefix_date}"
    count = (
        session.execute(select(func.count()).where(Invoice.number.like(f"{prefix}-%"))).scalar()
        or 0
    )
    sequence = count + 1
    candidate = f"{prefix}-{sequence:03d}"
    while _number_exists(session, candidate):
        sequence += 1
        candidate = f"{prefix}-{sequence:03d}"
    return candidate


def _parse_custom_sequence(number: str | None) -> InvoiceNumberSequence | None:
    normalized = _normalize_number(number)
    # Date-based defaults stay date-scoped; client-specific patterns like "21" or "GECG-021" continue sequentially.
    if not normalized or _DEFAULT_DATE_NUMBER_RE.match(normalized):
        return None
    match = _TRAILING_SEQUENCE_RE.match(normalized)
    if not match:
        return None
    sequence_text = match.group("sequence")
    return InvoiceNumberSequence(
        prefix=match.group("prefix"),
        value=int(sequence_text),
        width=len(sequence_text),
    )


def _client_invoice_sequences(session, client_id: int) -> list[InvoiceNumberSequence]:
    live_numbers = session.execute(
        select(Invoice.number).where(Invoice.client_id == client_id)
    ).scalars()
    archived_numbers = session.execute(
        select(ArchivedInvoice.number).where(ArchivedInvoice.client_id == client_id)
    ).scalars()
    return [
        sequence
        for sequence in (_parse_custom_sequence(number) for number in [*live_numbers, *archived_numbers])
        if sequence is not None
    ]


def _format_next_sequence(sequence: InvoiceNumberSequence, next_value: int) -> str:
    width = max(sequence.width, len(str(next_value)))
    return f"{sequence.prefix}{next_value:0{width}d}"


def _generate_client_number(session, client_id: int, issue_date: str | None) -> str:
    sequences = _client_invoice_sequences(session, client_id)
    if not sequences:
        return _generate_number(session, issue_date)

    latest = max(sequences, key=lambda sequence: sequence.value)
    next_value = latest.value + 1
    candidate = _format_next_sequence(latest, next_value)
    while _number_exists(session, candidate):
        next_value += 1
        candidate = _format_next_sequence(latest, next_value)
    return candidate


def preview_invoice_number(session, client_id: int, issue_date: str | None = None) -> str:
    return _generate_client_number(session, client_id, issue_date)


def _ensure_unique_number(
    session,
    client_id: int,
    proposed: str | None,
    issue_date: str | None,
    exclude_id: int | None = None,
) -> str:
    normalized = _normalize_number(proposed)
    if not normalized:
        return _generate_client_number(session, client_id, issue_date)
    if not _number_exists(session, normalized, exclude_id=exclude_id):
        return normalized
    suffix = 2
    candidate = f"{normalized}-{suffix}"
    while _number_exists(session, candidate, exclude_id=exclude_id):
        suffix += 1
        candidate = f"{normalized}-{suffix}"
    return candidate


def _compute_invoice_totals(data: dict) -> tuple[float, float, float]:
    subtotal = round(
        sum(float(item["quantity"]) * float(item["unit_price"]) for item in data["line_items"]),
        2,
    )
    tax = 0.0
    agreed_total = data.get("agreed_total")
    if agreed_total is None:
        total = subtotal + tax
    else:
        total_value = float(agreed_total)
        if not math.isfinite(total_value):
            raise ValueError("Agreed total must be a valid number")
        total = round(total_value, 2)
    return subtotal, tax, total


def _paid_total_for_invoice(session, invoice_id: int) -> float:
    paid_total = session.execute(
        select(func.sum(InvoicePaymentLink.amount)).where(InvoicePaymentLink.invoice_id == invoice_id)
    ).scalar()
    return round(float(paid_total or 0.0), 2)


def create_invoice(session, data: dict) -> Invoice:
    subtotal, tax, total = _compute_invoice_totals(data)
    number = _ensure_unique_number(session, data["client_id"], data.get("number"), data.get("issue_date"))

    invoice = Invoice(
        client_id=data["client_id"],
        number=number,
        status=data.get("status", "draft"),
        issue_date=data["issue_date"],
        due_date=data.get("due_date"),
        currency=data["currency"],
        subtotal=subtotal,
        tax=tax,
        total=total,
        notes=data.get("notes"),
        created_at=_now_str(),
    )
    session.add(invoice)
    session.flush()

    for item in data["line_items"]:
        line = InvoiceLineItem(
            invoice_id=invoice.id,
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            amount=item["quantity"] * item["unit_price"],
        )
        session.add(line)

    return invoice


def update_invoice(session, invoice_id: int, data: dict) -> Invoice:
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise ValueError("Invoice not found")

    subtotal, tax, total = _compute_invoice_totals(data)
    paid_total = _paid_total_for_invoice(session, invoice_id)
    if total + 0.005 < paid_total:
        raise ValueError("Invoice total cannot be lower than linked payments")
    number = _ensure_unique_number(
        session,
        data["client_id"],
        data.get("number"),
        data.get("issue_date"),
        exclude_id=invoice_id,
    )

    invoice.client_id = data["client_id"]
    invoice.number = number
    invoice.status = data.get("status", invoice.status or "draft")
    invoice.issue_date = data["issue_date"]
    invoice.due_date = data.get("due_date")
    invoice.currency = data["currency"]
    invoice.subtotal = subtotal
    invoice.tax = tax
    invoice.total = total
    invoice.notes = data.get("notes")

    session.execute(
        InvoiceLineItem.__table__.delete().where(InvoiceLineItem.invoice_id == invoice_id)
    )
    for item in data["line_items"]:
        line = InvoiceLineItem(
            invoice_id=invoice.id,
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            amount=item["quantity"] * item["unit_price"],
        )
        session.add(line)

    return invoice


def apply_payment(session, invoice_id: int, transaction_id: int, amount: float) -> dict:
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one()
    if amount <= 0:
        raise ValueError("Payment amount must be greater than 0")
    if amount > float(invoice.total or 0.0) + 0.005:
        raise ValueError("Payment amount exceeds the invoice total")
    existing = session.execute(
        select(InvoicePaymentLink).where(
            InvoicePaymentLink.invoice_id == invoice_id,
            InvoicePaymentLink.transaction_id == transaction_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise ValueError("This transaction is already linked to the invoice")

    total_paid_before = session.execute(
        select(func.sum(InvoicePaymentLink.amount)).where(InvoicePaymentLink.invoice_id == invoice_id)
    ).scalar() or 0.0
    balance_due = round(max(float(invoice.total or 0.0) - float(total_paid_before or 0.0), 0.0), 2)
    if amount > balance_due + 0.005:
        raise ValueError("Payment amount cannot exceed the remaining balance due")

    available_amount = transaction_available_amount(session, transaction_id)
    if amount > available_amount + 0.005:
        raise ValueError("Payment amount exceeds the remaining unallocated transaction amount")

    link = InvoicePaymentLink(invoice_id=invoice_id, transaction_id=transaction_id, amount=amount)
    session.add(link)
    session.flush()
    mark_transaction_as_business_receipt(session, transaction_id)

    total_paid = session.execute(
        select(func.sum(InvoicePaymentLink.amount)).where(InvoicePaymentLink.invoice_id == invoice_id)
    ).scalar() or 0.0
    invoice.status = compute_receivable_status(invoice.status or "sent", float(invoice.total or 0.0), float(total_paid))

    return {
        "total_paid": round(float(total_paid or 0.0), 2),
        "balance_due": round(max(float(invoice.total or 0.0) - float(total_paid or 0.0), 0.0), 2),
        "status": invoice.status,
    }


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
