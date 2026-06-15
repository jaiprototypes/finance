import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from ..timesheets.models import TimeEntry
from ..fx.currency import ensure_recent_fx_rates, get_recent_fortnightly_average_aud_per_usd
from .service import (
    budget_bucket_transactions,
    cashflow_by_month,
    category_spend,
    business_pnl,
    net_worth,
    timesheet_summary,
    expense_analysis,
    cashflow_forecast,
    budget_status,
    budget_matrix,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _refresh_fx_if_needed(session: Session) -> None:
    inserted = ensure_recent_fx_rates(session)
    if inserted:
        session.commit()
    try:
        get_recent_fortnightly_average_aud_per_usd(session)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/cashflow")
def cashflow(session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return cashflow_by_month(session)


@router.get("/category-spend")
def category_spend_report(session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return category_spend(session)


@router.get("/business-pnl")
def business_pnl_report(session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return business_pnl(session)


@router.get("/net-worth")
def net_worth_report(session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return net_worth(session)


@router.get("/budget-status")
def budget_status_report(month: str | None = None, session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return budget_status(session, month=month)


@router.get("/budget-matrix")
def budget_matrix_report(year: int, session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return budget_matrix(session, year=year)


@router.get("/budget-cell-transactions")
def budget_cell_transactions_report(
    month: str,
    bucket: str,
    subcategory_id: int | None = None,
    unassigned: bool = False,
    session: Session = Depends(get_session),
):
    _refresh_fx_if_needed(session)
    try:
        return budget_bucket_transactions(
            session,
            month=month,
            bucket_key=bucket,
            subcategory_id=subcategory_id,
            unassigned=unassigned,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/timesheets/summary")
def timesheet_summary_report(session: Session = Depends(get_session)):
    return timesheet_summary(session)


@router.get("/expense-analysis")
def expense_analysis_report(months: int = 6, session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return expense_analysis(session, months=months)


@router.get("/forecast")
def forecast_report(months: int = 6, session: Session = Depends(get_session)):
    _refresh_fx_if_needed(session)
    return cashflow_forecast(session, months=months)


@router.get("/timesheets/export")
def export_timesheet_csv(session: Session = Depends(get_session)):
    entries = session.execute(select(TimeEntry)).scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "project_id",
        "task_id",
        "date",
        "start_time",
        "end_time",
        "duration_minutes",
        "billable",
        "hourly_rate",
        "notes",
    ])
    for entry in entries:
        writer.writerow([
            entry.id,
            entry.project_id,
            entry.task_id,
            entry.date,
            entry.start_time,
            entry.end_time,
            entry.duration_minutes,
            entry.billable,
            entry.hourly_rate,
            entry.notes,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timesheets.csv"},
    )
