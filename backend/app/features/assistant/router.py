from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...db import get_session
from .schemas import AssistantSearchRequest
from .service import (
    budget_variance_assistant,
    debt_assistant,
    invoice_assistant,
    search_assistant,
    spending_assistant,
    timesheet_assistant,
)
from .local_ai import local_ai_status

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/status")
def assistant_status(session: Session = Depends(get_session)):
    return local_ai_status(session)


@router.post("/search")
def assistant_search(payload: AssistantSearchRequest, session: Session = Depends(get_session)):
    return search_assistant(session, query=payload.query, limit=payload.limit)


@router.get("/spending")
def assistant_spending(months: int = 3, session: Session = Depends(get_session)):
    try:
        return spending_assistant(session, months=months)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/budget-variance")
def assistant_budget_variance(month: str | None = None, session: Session = Depends(get_session)):
    try:
        return budget_variance_assistant(session, month=month)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/debts")
def assistant_debts(
    strategy: str = "avalanche",
    extra_payment: float = 0.0,
    session: Session = Depends(get_session),
):
    try:
        return debt_assistant(session, strategy=strategy, extra_payment=extra_payment)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/invoices")
def assistant_invoices(session: Session = Depends(get_session)):
    return invoice_assistant(session)


@router.get("/timesheets")
def assistant_timesheets(session: Session = Depends(get_session)):
    return timesheet_assistant(session)
