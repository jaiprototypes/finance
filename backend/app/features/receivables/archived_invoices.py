from __future__ import annotations

import hashlib
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select

from ...config import UPLOADS_DIR
from ..ledger.models import Account, Transaction
from .models import ArchivedInvoice, ArchivedInvoicePaymentLink, Client
from .business_receivables import (
    build_receipt_candidates,
    compute_receivable_status,
    mark_transaction_as_business_receipt,
    transaction_available_amount,
    transaction_payment_allocations,
)
from .receivable_tracking import days_overdue, tracking_state

ARCHIVED_INVOICE_DIR = Path(UPLOADS_DIR) / "invoice_archives"
DEFAULT_ARCHIVE_CURRENCY = "USD"
ARCHIVE_STATUSES = {"archived", "draft", "sent", "partial", "paid", "void"}
_COMPANY_HINTS = (
    "llc",
    "l.l.c",
    "inc",
    "corp",
    "corporation",
    "company",
    "consulting",
    "collective",
    "engineering",
    "technology",
    "tech",
    "group",
    "studio",
    "agency",
    "solutions",
    "partners",
    "ventures",
    "holdings",
    "pty",
    "ltd",
    "limited",
)


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _normalize_space(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_archive_status(value: str | None, default: str = "archived") -> str:
    normalized = _normalize_space(value).lower()
    if normalized in ARCHIVE_STATUSES:
        return normalized
    return default


def normalize_currency(value: str | None, default: str = DEFAULT_ARCHIVE_CURRENCY) -> str:
    normalized = _normalize_space(value).upper()
    if len(normalized) >= 3:
        return normalized[:3]
    return default


def normalize_date(value: str | None) -> str | None:
    text = _normalize_space(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return text[:10]


def ensure_client(
    session,
    *,
    client_id: int | None = None,
    client_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    notes: str | None = None,
) -> Client:
    if client_id is not None:
        client = session.execute(select(Client).where(Client.id == client_id)).scalar_one_or_none()
        if not client:
            raise LookupError("Client not found")
        return client

    name = _normalize_space(client_name)
    if not name:
        raise ValueError("Client name is required")

    client = session.execute(
        select(Client).where(func.lower(Client.name) == name.lower())
    ).scalar_one_or_none()
    if client:
        if email and not client.email:
            client.email = email
        if phone and not client.phone:
            client.phone = phone
        if address and not client.address:
            client.address = address
        if notes:
            existing_notes = _normalize_space(client.notes)
            if not existing_notes:
                client.notes = notes
            elif notes not in existing_notes:
                client.notes = f"{existing_notes}\n{notes}"
        if client.is_active == 0:
            client.is_active = 1
        return client

    normalized_address = _normalize_space(address).lower()
    normalized_notes = _normalize_space(notes).lower()
    if normalized_address and normalized_notes:
        for candidate in session.execute(
            select(Client).where(Client.is_active != 0).order_by(Client.id)
        ).scalars():
            if _normalize_space(candidate.address).lower() != normalized_address:
                continue
            if _normalize_space(candidate.notes).lower() != normalized_notes:
                continue
            existing_notes = _normalize_space(candidate.notes)
            alias_note = f"Alias: {name}"
            if alias_note not in existing_notes:
                candidate.notes = f"{existing_notes}\n{alias_note}" if existing_notes else alias_note
            return candidate

    client = Client(
        name=name,
        email=email,
        phone=phone,
        address=address,
        notes=notes,
        is_active=1,
    )
    session.add(client)
    session.flush()
    return client


def extract_invoice_text(file_path: Path) -> str:
    text = ""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(file_path))
        pages: list[str] = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text:
                pages.append(page_text)
        text = "\n".join(pages).strip()
    except Exception:
        text = ""

    if text:
        return text

    try:
        result = subprocess.run(
            ["pdftotext", "-layout", "-nopgbrk", str(file_path), "-"],
            capture_output=True,
            text=True,
            check=True,
            timeout=20,
        )
        return (result.stdout or "").strip()
    except Exception:
        return ""


def parse_invoice_pdf(file_path: Path, default_currency: str = DEFAULT_ARCHIVE_CURRENCY) -> dict[str, object]:
    if not file_path.exists():
        return {}
    text = extract_invoice_text(file_path)
    if not text:
        return {}
    return parse_invoice_text(text, default_currency=default_currency)


def parse_invoice_text(text: str, default_currency: str = DEFAULT_ARCHIVE_CURRENCY) -> dict[str, object]:
    body = text.replace("\xa0", " ")
    client_lines = _extract_bill_to_lines(body)
    client_name, contact_name, address = _derive_client_identity(client_lines)
    issue_date = _extract_value(body, r"Invoice date:\s*([0-9/\-]+)")
    due_date = _extract_value(body, r"Due date:\s*([0-9/\-]+)")
    invoice_number = _extract_value(body, r"Invoice no\.\s*:?\s*([A-Za-z0-9._\-]+)")
    total = _extract_total(body)
    client_notes = ""
    if contact_name and contact_name != client_name:
        client_notes = f"Primary contact: {contact_name}"
    return {
        "client_name": client_name,
        "client_address": address,
        "client_notes": client_notes,
        "number": invoice_number,
        "issue_date": normalize_date(issue_date),
        "due_date": normalize_date(due_date),
        "currency": normalize_currency(default_currency, default=default_currency),
        "total": total,
    }


def create_archived_invoice_from_upload(
    session,
    *,
    file_bytes: bytes,
    original_name: str,
    mime_type: str | None,
    client_id: int | None = None,
    client_name: str | None = None,
    number: str | None = None,
    issue_date: str | None = None,
    due_date: str | None = None,
    currency: str | None = None,
    total: float | None = None,
    status: str | None = None,
    notes: str | None = None,
    source_label: str = "upload",
) -> ArchivedInvoice:
    if not file_bytes:
        raise ValueError("Invoice file is required")

    checksum = hashlib.sha256(file_bytes).hexdigest()
    existing = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.checksum == checksum)
    ).scalar_one_or_none()
    if existing:
        raise FileExistsError("This invoice PDF has already been imported")

    target_path = _write_archive_file(file_bytes, original_name)
    try:
        parsed = {}
        if _looks_like_pdf(original_name, mime_type):
            parsed = parse_invoice_pdf(target_path, default_currency=currency or DEFAULT_ARCHIVE_CURRENCY)

        resolved_client = ensure_client(
            session,
            client_id=client_id,
            client_name=client_name or parsed.get("client_name"),
            address=parsed.get("client_address"),
            notes=parsed.get("client_notes"),
        )
        resolved_number = _normalize_space(number) or _normalize_space(parsed.get("number")) or Path(original_name).stem
        resolved_issue_date = normalize_date(issue_date) or normalize_date(parsed.get("issue_date"))
        resolved_due_date = normalize_date(due_date) or normalize_date(parsed.get("due_date"))
        resolved_currency = normalize_currency(
            currency or str(parsed.get("currency") or DEFAULT_ARCHIVE_CURRENCY),
            default=DEFAULT_ARCHIVE_CURRENCY,
        )
        resolved_total = float(total if total is not None else parsed.get("total") or 0.0)
        resolved_notes = _merge_notes(notes, parsed.get("client_notes"))

        record = ArchivedInvoice(
            client_id=resolved_client.id,
            number=resolved_number or None,
            status=normalize_archive_status(status),
            issue_date=resolved_issue_date,
            due_date=resolved_due_date,
            currency=resolved_currency,
            total=resolved_total,
            notes=resolved_notes,
            file_path=str(target_path),
            file_name=original_name or target_path.name,
            mime_type=mime_type,
            checksum=checksum,
            source_label=_normalize_space(source_label) or "upload",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
        session.add(record)
        session.flush()
        return record
    except Exception:
        target_path.unlink(missing_ok=True)
        raise


def import_archived_invoice_file(
    session,
    file_path: Path,
    *,
    client_id: int | None = None,
    client_name: str | None = None,
    status: str | None = None,
    currency: str | None = None,
    notes: str | None = None,
    source_label: str = "historical-import",
) -> ArchivedInvoice:
    payload = file_path.read_bytes()
    mime_type = "application/pdf" if file_path.suffix.lower() == ".pdf" else None
    return create_archived_invoice_from_upload(
        session,
        file_bytes=payload,
        original_name=file_path.name,
        mime_type=mime_type,
        client_id=client_id,
        client_name=client_name,
        status=status,
        currency=currency,
        notes=notes,
        source_label=source_label,
    )


def archived_invoice_payment_summary(
    session,
    archived_invoice_ids: list[int] | None = None,
) -> dict[int, dict[str, float | int | str | None]]:
    ids = list(dict.fromkeys(int(value) for value in archived_invoice_ids or []))
    query = (
        select(
            ArchivedInvoicePaymentLink.archived_invoice_id,
            func.sum(ArchivedInvoicePaymentLink.amount),
            func.count(ArchivedInvoicePaymentLink.id),
            func.max(Transaction.date),
        )
        .join(Transaction, Transaction.id == ArchivedInvoicePaymentLink.transaction_id, isouter=True)
        .group_by(ArchivedInvoicePaymentLink.archived_invoice_id)
    )
    if archived_invoice_ids is not None:
        if not ids:
            return {}
        query = query.where(ArchivedInvoicePaymentLink.archived_invoice_id.in_(ids))
    summary: dict[int, dict[str, float | int]] = {}
    for archived_invoice_id, paid_total, payment_count, last_payment_date in session.execute(query).all():
        summary[int(archived_invoice_id)] = {
            "paid_total": round(float(paid_total or 0.0), 2),
            "payment_count": int(payment_count or 0),
            "last_payment_date": str(last_payment_date)[:10] if last_payment_date else None,
        }
    return summary


def serialize_archived_invoice(
    session,
    archive: ArchivedInvoice,
    summary: dict[str, float | int | str | None] | None = None,
) -> dict[str, object]:
    resolved_summary = summary or archived_invoice_payment_summary(session, [archive.id]).get(archive.id, {})
    paid_total = round(float(resolved_summary.get("paid_total", 0.0) or 0.0), 2)
    balance_due = round(max(float(archive.total or 0.0) - paid_total, 0.0), 2)
    overdue_days = days_overdue(archive.due_date, archive.status, balance_due)
    return {
        "id": archive.id,
        "client_id": archive.client_id,
        "number": archive.number,
        "status": archive.status,
        "issue_date": archive.issue_date,
        "due_date": archive.due_date,
        "currency": archive.currency,
        "total": float(archive.total or 0.0),
        "notes": archive.notes,
        "file_name": archive.file_name,
        "mime_type": archive.mime_type,
        "source_label": archive.source_label,
        "created_at": archive.created_at,
        "updated_at": archive.updated_at,
        "paid_total": paid_total,
        "balance_due": balance_due,
        "payment_count": int(resolved_summary.get("payment_count", 0) or 0),
        "last_payment_date": resolved_summary.get("last_payment_date"),
        "is_overdue": overdue_days > 0,
        "days_overdue": overdue_days,
        "tracking_state": tracking_state(archive.status, balance_due, overdue_days),
    }


def archived_invoice_detail(session, archive: ArchivedInvoice) -> dict[str, object]:
    client = session.execute(select(Client).where(Client.id == archive.client_id)).scalar_one()
    invoice_payload = serialize_archived_invoice(session, archive)
    payment_rows = session.execute(
        select(ArchivedInvoicePaymentLink, Transaction, Account)
        .join(Transaction, Transaction.id == ArchivedInvoicePaymentLink.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .where(ArchivedInvoicePaymentLink.archived_invoice_id == archive.id)
        .order_by(Transaction.date.desc(), ArchivedInvoicePaymentLink.id.desc())
    ).all()
    allocations = transaction_payment_allocations(session, [txn.id for _, txn, _ in payment_rows])
    payments = [
        {
            "id": link.id,
            "archived_invoice_id": link.archived_invoice_id,
            "transaction_id": link.transaction_id,
            "amount": float(link.amount or 0.0),
            "created_at": link.created_at,
            "transaction_date": txn.date,
            "transaction_description": txn.description,
            "transaction_amount": float(txn.amount or 0.0),
            "transaction_currency": txn.currency,
            "transaction_account_name": account.name if account else None,
            "transaction_available_amount": round(
                float(txn.amount or 0.0) - allocations.get(txn.id, 0.0),
                2,
            ),
        }
        for link, txn, account in payment_rows
    ]
    candidate_transactions = build_receipt_candidates(
        session,
        client=client,
        invoice_currency=archive.currency,
        invoice_total=float(archive.total or 0.0),
        balance_due=float(invoice_payload["balance_due"] or 0.0),
        issue_date=archive.issue_date,
        due_date=archive.due_date,
        invoice_notes=archive.notes,
    )
    return {
        "invoice": invoice_payload,
        "payments": payments,
        "candidate_transactions": candidate_transactions,
        "paid_total": float(invoice_payload["paid_total"]),
        "balance_due": float(invoice_payload["balance_due"]),
    }


def update_archived_invoice(session, archived_invoice_id: int, data: dict) -> ArchivedInvoice:
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archived_invoice_id)
    ).scalar_one_or_none()
    if not archive:
        raise LookupError("Archived invoice not found")

    client = ensure_client(session, client_id=int(data["client_id"]))
    total_value = float(data.get("total") or 0.0)
    if total_value < 0:
        raise ValueError("Invoice total must be non-negative")
    archive.client_id = client.id
    archive.number = _normalize_space(data.get("number")) or None
    archive.issue_date = normalize_date(data.get("issue_date"))
    archive.due_date = normalize_date(data.get("due_date"))
    archive.currency = normalize_currency(data.get("currency"), default=archive.currency or DEFAULT_ARCHIVE_CURRENCY)
    archive.total = total_value
    archive.notes = str(data.get("notes") or "").strip() or None
    archive.status = normalize_archive_status(data.get("status"), default=archive.status or "archived")
    paid_total = archived_invoice_payment_summary(session, [archive.id]).get(archive.id, {}).get("paid_total", 0.0)
    archive.status = compute_receivable_status(archive.status, archive.total, float(paid_total or 0.0))
    archive.updated_at = _now_str()
    session.flush()
    return archive


def apply_archived_invoice_payment(
    session,
    archived_invoice_id: int,
    transaction_id: int,
    amount: float,
) -> dict[str, object]:
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archived_invoice_id)
    ).scalar_one_or_none()
    if not archive:
        raise LookupError("Archived invoice not found")
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise LookupError("Transaction not found")
    if amount <= 0:
        raise ValueError("Payment amount must be greater than 0")
    if float(txn.amount or 0.0) <= 0:
        raise ValueError("Only incoming transactions can be applied to invoices")
    if txn.currency != archive.currency:
        raise ValueError("Payment currency must match the invoice currency")

    existing = session.execute(
        select(ArchivedInvoicePaymentLink).where(
            ArchivedInvoicePaymentLink.archived_invoice_id == archived_invoice_id,
            ArchivedInvoicePaymentLink.transaction_id == transaction_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise ValueError("This transaction is already linked to the historical invoice")

    paid_total_before = float(
        archived_invoice_payment_summary(session, [archive.id]).get(archive.id, {}).get("paid_total", 0.0)
    )
    balance_due = round(max(float(archive.total or 0.0) - paid_total_before, 0.0), 2)
    if amount > balance_due + 0.005:
        raise ValueError("Payment amount cannot exceed the remaining balance due")

    available_amount = transaction_available_amount(session, transaction_id)
    if amount > available_amount + 0.005:
        raise ValueError("Payment amount exceeds the remaining unallocated transaction amount")

    link = ArchivedInvoicePaymentLink(
        archived_invoice_id=archived_invoice_id,
        transaction_id=transaction_id,
        amount=float(amount),
        created_at=_now_str(),
    )
    session.add(link)
    session.flush()
    mark_transaction_as_business_receipt(session, transaction_id)

    paid_total = float(
        archived_invoice_payment_summary(session, [archive.id]).get(archive.id, {}).get("paid_total", 0.0)
    )
    archive.status = compute_receivable_status(archive.status, float(archive.total or 0.0), paid_total)
    archive.updated_at = _now_str()
    session.flush()
    return {
        "payment_id": link.id,
        "paid_total": round(paid_total, 2),
        "balance_due": round(max(float(archive.total or 0.0) - paid_total, 0.0), 2),
        "status": archive.status,
    }


def remove_archived_invoice_payment(
    session,
    archived_invoice_id: int,
    payment_link_id: int,
) -> dict[str, object]:
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archived_invoice_id)
    ).scalar_one_or_none()
    if not archive:
        raise LookupError("Archived invoice not found")
    link = session.execute(
        select(ArchivedInvoicePaymentLink).where(
            ArchivedInvoicePaymentLink.id == payment_link_id,
            ArchivedInvoicePaymentLink.archived_invoice_id == archived_invoice_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise LookupError("Archived invoice payment link not found")

    session.delete(link)
    session.flush()

    paid_total = float(
        archived_invoice_payment_summary(session, [archive.id]).get(archive.id, {}).get("paid_total", 0.0)
    )
    archive.status = compute_receivable_status(archive.status, float(archive.total or 0.0), paid_total)
    archive.updated_at = _now_str()
    session.flush()
    return {
        "paid_total": round(paid_total, 2),
        "balance_due": round(max(float(archive.total or 0.0) - paid_total, 0.0), 2),
        "status": archive.status,
    }


def _looks_like_pdf(original_name: str, mime_type: str | None) -> bool:
    if mime_type and "pdf" in mime_type.lower():
        return True
    return original_name.lower().endswith(".pdf")


def _write_archive_file(file_bytes: bytes, original_name: str) -> Path:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name or "invoice.pdf").strip("._")
    safe_name = safe_name or "invoice.pdf"
    ARCHIVED_INVOICE_DIR.mkdir(parents=True, exist_ok=True)
    target_path = ARCHIVED_INVOICE_DIR / f"{uuid4().hex}_{safe_name}"
    target_path.write_bytes(file_bytes)
    return target_path


def _extract_value(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    return _normalize_space(match.group(1))


def _extract_bill_to_lines(text: str) -> list[str]:
    lines = text.splitlines()
    capture = False
    results: list[str] = []
    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()
        lower = stripped.lower()
        if lower.startswith("bill to"):
            capture = True
            continue
        if not capture:
            continue
        if results and lower.startswith("ship to"):
            break
        if lower.startswith("invoice details"):
            break
        if not stripped:
            if results:
                break
            continue
        left_column = re.split(r"\s{2,}", line.lstrip(), maxsplit=1)[0].strip()
        cleaned = _normalize_space(left_column)
        if cleaned and cleaned.lower() != "bill to":
            results.append(cleaned)
    deduped: list[str] = []
    for item in results:
        if not deduped or deduped[-1] != item:
            deduped.append(item)
    return deduped


def _derive_client_identity(lines: list[str]) -> tuple[str | None, str | None, str | None]:
    if not lines:
        return None, None, None
    best_index = 0
    for idx, line in enumerate(lines):
        lowered = line.lower()
        if any(hint in lowered for hint in _COMPANY_HINTS):
            best_index = idx
            break
    client_name = lines[best_index]
    contact_name = lines[0] if best_index > 0 else None
    address_lines = [line for idx, line in enumerate(lines) if idx > best_index]
    address = "\n".join(address_lines).strip() or None
    return client_name, contact_name, address


def _extract_total(text: str) -> float:
    explicit_patterns = (
        r"Balance due[:\s]+\$?([0-9][0-9,]*\.\d{2})",
        r"Total due[:\s]+\$?([0-9][0-9,]*\.\d{2})",
        r"Total[:\s]+\$?([0-9][0-9,]*\.\d{2})",
    )
    for pattern in explicit_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return _parse_amount(match.group(1))

    amounts: list[float] = []
    in_items = False
    for raw_line in text.splitlines():
        lower = raw_line.lower()
        if "product or service" in lower and "amount" in lower:
            in_items = True
            continue
        if not in_items:
            continue
        if "token =" in lower:
            break
        if not raw_line.strip():
            continue
        matches = re.findall(r"\$([0-9][0-9,]*\.\d{2})", raw_line)
        if not matches:
            continue
        if re.match(r"\s*\d+[\.)]?", raw_line) or len(matches) >= 2:
            amounts.append(_parse_amount(matches[-1]))
    if not amounts:
        return 0.0
    return round(sum(amounts), 2)


def _parse_amount(value: str) -> float:
    return float(value.replace(",", "").strip())


def _merge_notes(user_notes: str | None, parsed_notes: object) -> str | None:
    values = [_normalize_space(user_notes), _normalize_space(parsed_notes if isinstance(parsed_notes, str) else "")]
    merged = [value for value in values if value]
    if not merged:
        return None
    if len(merged) == 2 and merged[0] == merged[1]:
        return merged[0]
    return "\n".join(merged)
