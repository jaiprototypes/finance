"""Reconcile provider account availability without deleting ledger history."""

from sqlalchemy import select

from .models import UpAccount
from ..ledger.models import Account


class UpAccountLifecycle:
    """Use a complete successful provider snapshot as the account availability source."""

    @staticmethod
    def reconcile(session, provider_ids: set[str], *, observed_at: str) -> int:
        """Archive absent links and reactivate returning IDs while preserving their records."""
        archived = 0
        for mapping in session.scalars(select(UpAccount)):
            active = int(mapping.up_account_id in provider_ids)
            archived += int(bool(mapping.is_active) and not active)
            mapping.is_active = active
            mapping.updated_at = observed_at
            account = session.get(Account, mapping.account_id)
            if account:
                account.is_active = active
                account.updated_at = observed_at
        return archived
