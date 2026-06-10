from sqlalchemy.orm import Session
from collections.abc import Iterable

from .invoice_tracking import auto_track_receivables


class ReceivableTrackingService:
    def reconcile_after_ledger_change(
        self,
        session: Session,
        *,
        invoice_ids: Iterable[int] | None = None,
        archived_invoice_ids: Iterable[int] | None = None,
    ) -> dict[str, int]:
        return auto_track_receivables(
            session,
            invoice_ids=invoice_ids,
            archived_invoice_ids=archived_invoice_ids,
        )
