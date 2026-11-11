"""Shared bank status and merchant credits for expense reports."""

from collections import defaultdict

from sqlalchemy import select, text

from .models import Transaction


class BankActivityPolicy:
    """Separate pending reservations from paid expenses without editing receipts."""

    def __init__(self, session):
        # Project source metadata without coupling the ledger to connector implementations.
        up = session.execute(text(
            "SELECT transaction_id, status, cashback_amount, round_up_amount FROM up_transaction"
        )).all()
        plaid = session.execute(text("SELECT transaction_id, pending FROM plaid_transaction")).all()
        linked = {row[0] for row in up + plaid}
        self.pending_ids = {txn_id for txn_id, status, _, _ in up if (status or "").upper() == "HELD"}
        self.pending_ids.update(txn_id for txn_id, pending in plaid if pending)
        self.pending_ids.update(session.scalars(select(Transaction.id).where(
            Transaction.reconciliation_state == "pending", Transaction.id.not_in(linked),
        )).all())
        self.cashbacks = {txn_id: float(amount or 0) for txn_id, _, amount, _ in up if amount}
        self.roundups = {txn_id: float(amount or 0) for txn_id, _, _, amount in up if amount}

    def split_amounts(self, splits) -> dict[int, float]:
        """Allocate a merchant cashback across debit splits exactly once."""
        negative_totals = defaultdict(float)
        for split in splits:
            negative_totals[split.transaction_id] += max(-float(split.amount or 0), 0)
        amounts = {}
        for split in splits:
            gross = float(split.amount or 0)
            debit_total = negative_totals[split.transaction_id]
            cashback = self.cashbacks.get(split.transaction_id, 0)
            credit = cashback * -gross / debit_total if gross < 0 and debit_total else 0
            amounts[split.id] = gross + credit
        return amounts
