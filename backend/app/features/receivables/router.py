from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...db import get_session
from .business_router import router as business_router
from .service import ReceivableTrackingService

receivables_router = APIRouter(prefix="/receivables", tags=["receivables"])


@receivables_router.post("/reconcile")
def reconcile_receivables(session: Session = Depends(get_session)):
    tracking = ReceivableTrackingService().reconcile_after_ledger_change(session)
    session.commit()
    return tracking


__all__ = ["business_router", "receivables_router"]
