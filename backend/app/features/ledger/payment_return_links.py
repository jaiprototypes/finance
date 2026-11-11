"""Persist reviewed failed-payment links without changing bank transactions."""

import json
from datetime import datetime, timezone

from sqlalchemy import select

from ...core.settings import get_setting, set_setting
from .models import Transaction


class ConfirmedPaymentReturns:
    """Keep individual confirmations ahead of inferred return timing rules."""

    setting_key = "confirmed_payment_return_pairs"

    @classmethod
    def load(cls, session) -> list:
        """Preserve malformed saved data as an audit issue instead of crashing reports."""
        raw = get_setting(session, cls.setting_key)
        if raw is None:
            return []
        try:
            records = json.loads(raw)
        except (TypeError, ValueError):
            return [{"invalid": True}]
        return records if isinstance(records, list) else [{"invalid": True}]

    @staticmethod
    def identities(record) -> tuple[int, int] | None:
        """Accept only distinct positive ledger IDs, excluding boolean JSON values."""
        if not isinstance(record, dict):
            return None
        values = record.get("payment_id"), record.get("return_id")
        if any(type(value) is not int or value <= 0 for value in values):
            return None
        return values if values[0] != values[1] else None

    @classmethod
    def confirm(cls, session, *, payment_id: int, return_id: int, note: str) -> dict:
        """Validate and save one user-confirmed pair; leave commit ownership to the caller."""
        from .payment_reversals import FailedPaymentMatcher

        record = {"payment_id": payment_id, "return_id": return_id}
        if not cls.identities(record):
            raise ValueError("A confirmation requires two distinct positive transaction IDs")
        session.flush()
        rows = {row.id: row for row in session.scalars(
            select(Transaction).where(Transaction.id.in_((payment_id, return_id))))}
        error = FailedPaymentMatcher.confirmation_error(rows.get(payment_id), rows.get(return_id))
        if error:
            raise ValueError(error)
        records = cls._without_existing_pair(cls.load(session), record)
        record.update(note=note, confirmed_at=datetime.now(timezone.utc).isoformat())
        records.append(record)
        value = json.dumps(records, separators=(",", ":"))
        set_setting(session, cls.setting_key, value)
        return record

    @classmethod
    def _without_existing_pair(cls, records, proposed) -> list:
        """Update an identical confirmation while rejecting conflicting saved claims."""
        retained = []
        proposed_ids = cls.identities(proposed)
        for record in records:
            identities = cls.identities(record)
            if not identities:
                raise ValueError("Saved payment confirmations need review")
            if identities == proposed_ids:
                continue
            if set(identities).intersection(proposed_ids):
                raise ValueError("A transaction is already linked to another payment return")
            retained.append(record)
        return retained
