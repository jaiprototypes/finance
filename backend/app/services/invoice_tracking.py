from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import func, select

from ..models import ArchivedInvoice, Client, Invoice, InvoicePaymentLink, Transaction
from .archived_invoices import (
    apply_archived_invoice_payment,
    archived_invoice_payment_summary,
    serialize_archived_invoice,
)
from .business_receivables import build_receipt_candidates, compute_receivable_status
from .invoices import apply_payment
from .receivable_tracking import days_overdue, select_auto_receipt_candidate, tracking_state


@dataclass
class ReceivableRecord:
    kind: str
    record_id: int
    client_id: int
    currency: str
    total: float
    balance_due: float
    issue_date: str | None
    due_date: str | None
    notes: str | None
    status: str


def invoice_payment_summary(
    session,
    invoice_ids: Iterable[int] | None = None,
) -> dict[int, dict[str, object]]:
    ids = _normalize_ids(invoice_ids)
    summary: dict[int, dict[str, object]] = {}
    query = (
        select(
            InvoicePaymentLink.invoice_id,
            func.sum(InvoicePaymentLink.amount),
            func.count(InvoicePaymentLink.id),
            func.max(Transaction.date),
        )
        .join(Transaction, Transaction.id == InvoicePaymentLink.transaction_id, isouter=True)
        .group_by(InvoicePaymentLink.invoice_id)
    )
    if invoice_ids is not None:
        if not ids:
            return {}
        query = query.where(InvoicePaymentLink.invoice_id.in_(ids))
    for invoice_id, paid_total, payment_count, last_payment_date in session.execute(query).all():
        summary[int(invoice_id)] = {
            "paid_total": round(float(paid_total or 0.0), 2),
            "payment_count": int(payment_count or 0),
            "last_payment_date": str(last_payment_date)[:10] if last_payment_date else None,
        }
    return summary


def serialize_invoice(session, invoice: Invoice, summary: dict[str, object] | None = None) -> dict[str, object]:
    resolved = summary or invoice_payment_summary(session, [invoice.id]).get(invoice.id, {})
    paid_total = round(float(resolved.get("paid_total", 0.0) or 0.0), 2)
    payment_count = int(resolved.get("payment_count", 0) or 0)
    balance_due = round(max(float(invoice.total or 0.0) - paid_total, 0.0), 2)
    adjustment = round(float(invoice.total or 0.0) - float(invoice.subtotal or 0.0) - float(invoice.tax or 0.0), 2)
    overdue_days = days_overdue(invoice.due_date, invoice.status, balance_due)
    return {
        "id": invoice.id,
        "client_id": invoice.client_id,
        "number": invoice.number,
        "status": invoice.status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "currency": invoice.currency,
        "subtotal": float(invoice.subtotal or 0.0),
        "tax": float(invoice.tax or 0.0),
        "total": float(invoice.total or 0.0),
        "adjustment": adjustment,
        "notes": invoice.notes,
        "paid_total": paid_total,
        "balance_due": balance_due,
        "payment_count": payment_count,
        "last_payment_date": resolved.get("last_payment_date"),
        "is_overdue": overdue_days > 0,
        "days_overdue": overdue_days,
        "tracking_state": tracking_state(invoice.status, balance_due, overdue_days),
    }


def sync_invoice_statuses(session, invoice_ids: Iterable[int] | None = None) -> int:
    ids = _normalize_ids(invoice_ids)
    query = select(Invoice)
    if invoice_ids is not None:
        if not ids:
            return 0
        query = query.where(Invoice.id.in_(ids))
    invoices = session.execute(query).scalars().all()
    if not invoices:
        return 0
    summary = invoice_payment_summary(session, [invoice.id for invoice in invoices])
    updated = 0
    for invoice in invoices:
        resolved = summary.get(invoice.id, {})
        next_status = compute_receivable_status(
            invoice.status,
            float(invoice.total or 0.0),
            float(resolved.get("paid_total", 0.0) or 0.0),
        )
        if invoice.status != next_status:
            invoice.status = next_status
            updated += 1
    return updated


def sync_archived_invoice_statuses(session, archived_invoice_ids: Iterable[int] | None = None) -> int:
    ids = _normalize_ids(archived_invoice_ids)
    query = select(ArchivedInvoice)
    if archived_invoice_ids is not None:
        if not ids:
            return 0
        query = query.where(ArchivedInvoice.id.in_(ids))
    archives = session.execute(query).scalars().all()
    if not archives:
        return 0
    summary = archived_invoice_payment_summary(session, [archive.id for archive in archives])
    updated = 0
    for archive in archives:
        resolved = summary.get(archive.id, {})
        next_status = compute_receivable_status(
            archive.status,
            float(archive.total or 0.0),
            float(resolved.get("paid_total", 0.0) or 0.0),
        )
        if archive.status != next_status:
            archive.status = next_status
            updated += 1
    return updated


def auto_track_invoices(session, invoice_ids: Iterable[int] | None = None) -> dict[str, int]:
    ids = _normalize_ids(invoice_ids)
    tracking = auto_track_receivables(session, invoice_ids=ids)
    return {
        "inspected": _invoice_count(session, ids),
        "status_updates": tracking["status_updates"],
        "auto_applied": tracking["auto_applied"],
    }


def auto_track_archived_invoices(session, archived_invoice_ids: Iterable[int] | None = None) -> dict[str, int]:
    ids = _normalize_ids(archived_invoice_ids)
    tracking = auto_track_receivables(session, archived_invoice_ids=ids)
    return {
        "inspected": _archived_invoice_count(session, ids),
        "status_updates": tracking["status_updates"],
        "auto_applied": tracking["auto_applied"],
    }


def auto_track_receivables(
    session,
    *,
    invoice_ids: Iterable[int] | None = None,
    archived_invoice_ids: Iterable[int] | None = None,
) -> dict[str, int]:
    normalized_invoice_ids = _normalize_ids(invoice_ids)
    normalized_archive_ids = _normalize_ids(archived_invoice_ids)
    status_updates = sync_invoice_statuses(session, normalized_invoice_ids)
    status_updates += sync_archived_invoice_statuses(session, normalized_archive_ids)
    auto_applied = auto_apply_receipts(
        session,
        invoice_ids=normalized_invoice_ids,
        archived_invoice_ids=normalized_archive_ids,
    )
    if auto_applied:
        status_updates += sync_invoice_statuses(session, normalized_invoice_ids)
        status_updates += sync_archived_invoice_statuses(session, normalized_archive_ids)
    return {
        "invoice_inspected": _invoice_count(session, normalized_invoice_ids),
        "archived_inspected": _archived_invoice_count(session, normalized_archive_ids),
        "status_updates": status_updates,
        "auto_applied": auto_applied,
    }


def auto_apply_receipts(
    session,
    *,
    invoice_ids: Iterable[int] | None = None,
    archived_invoice_ids: Iterable[int] | None = None,
) -> int:
    receivables = _collect_receivables(
        session,
        invoice_ids=_normalize_ids(invoice_ids),
        archived_invoice_ids=_normalize_ids(archived_invoice_ids),
    )
    if not receivables:
        return 0

    exact_amount_counts = Counter(
        (
            int(receivable.client_id),
            str(receivable.currency or "").upper(),
            round(float(receivable.balance_due or 0.0), 2),
        )
        for receivable in receivables
    )
    client_ids = list({receivable.client_id for receivable in receivables})
    clients = session.execute(select(Client).where(Client.id.in_(client_ids))).scalars().all()
    client_by_id = {client.id: client for client in clients}

    proposals_by_transaction: dict[int, list[tuple[ReceivableRecord, float]]] = defaultdict(list)
    for receivable in receivables:
        client = client_by_id.get(receivable.client_id)
        if not client:
            continue
        target_amount = round(float(receivable.balance_due or 0.0), 2)
        if target_amount <= 0.005:
            continue
        if exact_amount_counts[(int(receivable.client_id), str(receivable.currency or "").upper(), target_amount)] > 1:
            continue
        candidates = build_receipt_candidates(
            session,
            client=client,
            invoice_currency=receivable.currency,
            invoice_total=receivable.total,
            balance_due=target_amount,
            issue_date=receivable.issue_date,
            due_date=receivable.due_date,
            invoice_notes=receivable.notes,
            limit=8,
        )
        candidate = select_auto_receipt_candidate(candidates, target_amount)
        if not candidate:
            continue
        proposals_by_transaction[int(candidate["id"])].append((receivable, target_amount))

    applied = 0
    for transaction_id, proposals in proposals_by_transaction.items():
        if len(proposals) != 1:
            continue
        receivable, amount = proposals[0]
        try:
            if receivable.kind == "invoice":
                apply_payment(session, receivable.record_id, transaction_id, amount)
            else:
                apply_archived_invoice_payment(session, receivable.record_id, transaction_id, amount)
            applied += 1
        except (LookupError, ValueError):
            continue
    return applied


def _collect_receivables(
    session,
    *,
    invoice_ids: list[int] | None,
    archived_invoice_ids: list[int] | None,
) -> list[ReceivableRecord]:
    receivables: list[ReceivableRecord] = []

    invoice_query = select(Invoice).order_by(Invoice.issue_date.asc(), Invoice.id.asc())
    if invoice_ids is not None:
        if invoice_ids:
            invoice_query = invoice_query.where(Invoice.id.in_(invoice_ids))
        else:
            invoice_query = None
    if invoice_query is not None:
        invoices = session.execute(invoice_query).scalars().all()
        invoice_summary = invoice_payment_summary(session, [invoice.id for invoice in invoices])
        for invoice in invoices:
            payload = serialize_invoice(session, invoice, invoice_summary.get(invoice.id))
            if payload["status"] in {"draft", "void", "paid"}:
                continue
            if float(payload["balance_due"] or 0.0) <= 0.005:
                continue
            receivables.append(
                ReceivableRecord(
                    kind="invoice",
                    record_id=invoice.id,
                    client_id=int(invoice.client_id),
                    currency=str(invoice.currency or ""),
                    total=float(invoice.total or 0.0),
                    balance_due=float(payload["balance_due"] or 0.0),
                    issue_date=invoice.issue_date,
                    due_date=invoice.due_date,
                    notes=invoice.notes,
                    status=str(invoice.status or ""),
                )
            )

    archive_query = select(ArchivedInvoice).order_by(ArchivedInvoice.issue_date.asc(), ArchivedInvoice.id.asc())
    if archived_invoice_ids is not None:
        if archived_invoice_ids:
            archive_query = archive_query.where(ArchivedInvoice.id.in_(archived_invoice_ids))
        else:
            archive_query = None
    if archive_query is not None:
        archives = session.execute(archive_query).scalars().all()
        archive_summary = archived_invoice_payment_summary(session, [archive.id for archive in archives])
        for archive in archives:
            payload = serialize_archived_invoice(session, archive, archive_summary.get(archive.id))
            if payload["status"] in {"draft", "void", "paid"}:
                continue
            if float(payload["balance_due"] or 0.0) <= 0.005:
                continue
            receivables.append(
                ReceivableRecord(
                    kind="archive",
                    record_id=archive.id,
                    client_id=int(archive.client_id),
                    currency=str(archive.currency or ""),
                    total=float(archive.total or 0.0),
                    balance_due=float(payload["balance_due"] or 0.0),
                    issue_date=archive.issue_date,
                    due_date=archive.due_date,
                    notes=archive.notes,
                    status=str(archive.status or ""),
                )
            )

    return receivables


def _normalize_ids(record_ids: Iterable[int] | None) -> list[int] | None:
    if record_ids is None:
        return None
    seen: list[int] = []
    for value in record_ids:
        number = int(value)
        if number not in seen:
            seen.append(number)
    return seen


def _invoice_count(session, invoice_ids: Iterable[int] | None) -> int:
    ids = _normalize_ids(invoice_ids)
    query = select(func.count()).select_from(Invoice)
    if invoice_ids is not None:
        if not ids:
            return 0
        query = query.where(Invoice.id.in_(ids))
    return int(session.execute(query).scalar() or 0)


def _archived_invoice_count(session, archived_invoice_ids: Iterable[int] | None) -> int:
    ids = _normalize_ids(archived_invoice_ids)
    query = select(func.count()).select_from(ArchivedInvoice)
    if archived_invoice_ids is not None:
        if not ids:
            return 0
        query = query.where(ArchivedInvoice.id.in_(ids))
    return int(session.execute(query).scalar() or 0)
