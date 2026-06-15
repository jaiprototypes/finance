from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import func, select

from ...core.ledger_filters import is_legacy_opening
from ..ledger.models import Account, Transaction, TransactionSplit
from .models import ArchivedInvoicePaymentLink, Client, InvoicePaymentLink

_CLIENT_NOTE_LABELS = {
    "primary contact",
    "billing contact",
    "contact",
    "alias",
    "client alias",
}
_STANDARD_MLINK_RECEIPT_WINDOW_DAYS = 7


def compute_receivable_status(current_status: str | None, total: float, paid_total: float) -> str:
    total_value = float(total or 0.0)
    paid_value = float(paid_total or 0.0)
    existing = str(current_status or "").strip().lower() or "archived"
    if existing == "void":
        return "void"
    if paid_value >= total_value - 0.005 and total_value > 0:
        return "paid"
    if paid_value > 0.005:
        return "partial"
    if existing in {"paid", "partial"}:
        return "sent"
    return existing


def transaction_payment_allocations(
    session,
    transaction_ids: Iterable[int] | None = None,
) -> dict[int, float]:
    ids = _normalize_ids(transaction_ids)
    allocations: dict[int, float] = {}
    for model in (InvoicePaymentLink, ArchivedInvoicePaymentLink):
        query = select(model.transaction_id, func.sum(model.amount)).group_by(model.transaction_id)
        if ids is not None:
            if not ids:
                return {}
            query = query.where(model.transaction_id.in_(ids))
        for transaction_id, total in session.execute(query).all():
            allocations[transaction_id] = allocations.get(transaction_id, 0.0) + float(total or 0.0)
    return allocations


def transaction_available_amount(session, transaction_id: int) -> float:
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise LookupError("Transaction not found")
    allocated = transaction_payment_allocations(session, [transaction_id]).get(transaction_id, 0.0)
    return round(float(txn.amount or 0.0) - allocated, 2)


def mark_transaction_as_business_receipt(session, transaction_id: int) -> None:
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise LookupError("Transaction not found")
    txn.classification = "Business"
    txn.updated_at = _now_str()
    session.execute(
        TransactionSplit.__table__.update()
        .where(TransactionSplit.transaction_id == transaction_id)
        .values(classification="Business")
    )


def build_receipt_candidates(
    session,
    *,
    client: Client,
    invoice_currency: str,
    invoice_total: float,
    balance_due: float,
    issue_date: str | None,
    due_date: str | None,
    invoice_notes: str | None = None,
    limit: int = 24,
) -> list[dict[str, object]]:
    query = (
        select(Transaction, Account)
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.amount > 0)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    if invoice_currency:
        query = query.where(Transaction.currency == invoice_currency)
    rows = session.execute(query).all()
    if not rows:
        return []

    allocations = transaction_payment_allocations(session, [txn.id for txn, _ in rows])
    aliases = _client_aliases(client, invoice_notes)
    alias_tokens = [_tokenize(alias) for alias in aliases]
    target_amount = float(balance_due if balance_due > 0.005 else invoice_total or 0.0)
    issue_marker = _parse_date(issue_date)
    due_marker = _parse_date(due_date)

    candidates: list[dict[str, object]] = []
    for txn, account in rows:
        if is_legacy_opening(txn.description, txn.notes, txn.payee):
            continue
        available_amount = round(float(txn.amount or 0.0) - allocations.get(txn.id, 0.0), 2)
        if available_amount <= 0.005:
            continue

        haystack = _normalize_text(" ".join([txn.description or "", txn.payee or "", txn.notes or ""]))
        haystack_tokens = set(haystack.split())
        score = 1
        reasons: list[str] = []

        matched_aliases = [alias for alias in aliases if _normalize_text(alias) in haystack]
        if matched_aliases:
            score += 90
            reasons.append(f"Matches {matched_aliases[0]}")
        else:
            overlap_score = 0
            for tokens in alias_tokens:
                if not tokens:
                    continue
                overlap = len(tokens & haystack_tokens)
                if overlap >= 2:
                    overlap_score = max(overlap_score, overlap)
            if overlap_score:
                score += min(50, overlap_score * 16)
                reasons.append("Matches client keywords")

        if target_amount > 0:
            if abs(available_amount - target_amount) < 0.01:
                score += 60
                reasons.append("Matches balance due")
            elif abs(float(txn.amount or 0.0) - invoice_total) < 0.01:
                score += 45
                reasons.append("Matches invoice total")
            elif available_amount < target_amount + 0.01:
                score += 8

        txn_marker = _parse_date(txn.date)
        if txn_marker and issue_marker:
            day_offset = (txn_marker - issue_marker).days
            if day_offset >= 0:
                if matched_aliases and "mlink" in haystack and day_offset <= _STANDARD_MLINK_RECEIPT_WINDOW_DAYS:
                    score += 36
                    reasons.append("Client MLink within 7 days of invoice")
                if due_marker and txn_marker <= due_marker:
                    score += 16
                    reasons.append("Falls within invoice window")
                elif day_offset <= 120:
                    score += 10
                    reasons.append("Close to invoice date")

        if str(txn.classification or "").lower() == "business":
            score += 6
        if allocations.get(txn.id, 0.0) > 0.005:
            reasons.append("Partly allocated already")

        candidates.append(
            {
                "id": txn.id,
                "date": txn.date,
                "description": txn.description,
                "amount": float(txn.amount or 0.0),
                "currency": txn.currency,
                "payee": txn.payee,
                "notes": txn.notes,
                "classification": txn.classification,
                "reconciliation_state": txn.reconciliation_state,
                "account_id": txn.account_id,
                "account_name": account.name if account else None,
                "allocated_amount": round(allocations.get(txn.id, 0.0), 2),
                "available_amount": available_amount,
                "match_score": score,
                "match_reason": "; ".join(reasons) if reasons else "Potential receipt",
            }
        )

    candidates.sort(
        key=lambda row: (
            int(row["match_score"]),
            str(row["date"]),
            float(row["available_amount"]),
            int(row["id"]),
        ),
        reverse=True,
    )
    return candidates[:limit]


def _normalize_ids(transaction_ids: Iterable[int] | None) -> list[int] | None:
    if transaction_ids is None:
        return None
    seen: list[int] = []
    for value in transaction_ids:
        number = int(value)
        if number not in seen:
            seen.append(number)
    return seen


def _client_aliases(client: Client, invoice_notes: str | None = None) -> list[str]:
    aliases: list[str] = []
    for value in [client.name, client.notes, invoice_notes]:
        for candidate in _extract_alias_values(value):
            if candidate and candidate not in aliases:
                aliases.append(candidate)
    return aliases


def _extract_alias_values(value: str | None) -> list[str]:
    if not value:
        return []
    results: list[str] = []
    for raw_line in str(value).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line not in results:
            results.append(line)
        if ":" in line:
            label, candidate = line.split(":", 1)
            if label.strip().lower() in _CLIENT_NOTE_LABELS:
                candidate = candidate.strip()
                if candidate and candidate not in results:
                    results.append(candidate)
    return results


def _normalize_text(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _tokenize(value: str) -> set[str]:
    return {token for token in _normalize_text(value).split() if len(token) >= 3}


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()
