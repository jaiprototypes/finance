from sqlalchemy.orm import Session
from collections.abc import Iterable

from ...core.events import register_ledger_change_handler
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


def _reconcile_ledger_change(
    session: Session,
    *,
    invoice_ids: Iterable[int] | None = None,
    archived_invoice_ids: Iterable[int] | None = None,
) -> dict[str, int]:
    return ReceivableTrackingService().reconcile_after_ledger_change(
        session,
        invoice_ids=invoice_ids,
        archived_invoice_ids=archived_invoice_ids,
    )


register_ledger_change_handler(_reconcile_ledger_change)
