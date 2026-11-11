from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from .models import BudgetBucketTarget, BudgetMonth
from ..connectors.models import PlaidItem, UpAccount
from .schemas import BudgetBucketTargetCreate, BudgetBucketTargetOut, BudgetMonthCreate
from ..receivables.service import ReceivableTrackingService
from .service import month_state
from ..taxonomy.service import list_budget_buckets, require_budget_bucket
from ..connectors.plaid_client import is_configured as plaid_is_configured, sync_transactions as sync_plaid_transactions
from ..connectors.up_client import (
    is_configured as up_is_configured,
    sync_transactions as sync_up_transactions,
)

router = APIRouter(prefix="/budgets", tags=["budgets"])
BANK_REFRESH_MAX_AGE_DAYS = 14
receivable_tracking = ReceivableTrackingService()


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_older_than(dt: datetime | None, days: int) -> bool:
    if not dt:
        return True
    now = datetime.now(tz=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < now - timedelta(days=days)


def _require_recent_bank_refresh(session: Session) -> None:
    stale_messages: list[str] = []
    refreshed = False

    plaid_items = session.execute(
        select(PlaidItem).where(PlaidItem.status != "duplicate")
    ).scalars().all()
    plaid_needs_refresh = bool(
        plaid_items
        and plaid_is_configured()
        and any(
            not item.cursor or _is_older_than(_parse_timestamp(item.updated_at), BANK_REFRESH_MAX_AGE_DAYS)
            for item in plaid_items
        )
    )
    if plaid_needs_refresh:
        try:
            sync_plaid_transactions(session, full=False)
            refreshed = True
        except ValueError as exc:
            stale_messages.append(f"Plaid refresh failed: {exc}")

    up_accounts = session.execute(
        select(UpAccount).where(UpAccount.is_active == 1)
    ).scalars().all()
    up_needs_refresh = bool(
        up_accounts
        and up_is_configured()
        and any(
            not account.last_synced_at
            or _is_older_than(
                _parse_timestamp(account.last_synced_at),
                BANK_REFRESH_MAX_AGE_DAYS,
            )
            for account in up_accounts
        )
    )
    if up_needs_refresh:
        try:
            sync_up_transactions(session, full=False)
            refreshed = True
        except ValueError as exc:
            stale_messages.append(f"Up refresh failed: {exc}")

    if refreshed:
        receivable_tracking.reconcile_after_ledger_change(session)

    if stale_messages:
        raise HTTPException(status_code=503, detail=" ".join(stale_messages))


def _require_budget_month(session: Session, budget_month_id: int) -> BudgetMonth:
    month = session.execute(
        select(BudgetMonth).where(BudgetMonth.id == budget_month_id)
    ).scalar_one_or_none()
    if not month:
        raise HTTPException(status_code=400, detail="Budget month not found")
    return month


def _require_editable_budget_month(session: Session, budget_month_id: int) -> BudgetMonth:
    """Lock past actuals without treating a recorded budget deficit as bank cash."""
    month = _require_budget_month(session, budget_month_id)
    if month_state(str(month.month)) == "past":
        raise HTTPException(status_code=400, detail="Past months are locked and cannot be edited.")
    return month


def _validate_target_date(payload: BudgetBucketTargetCreate, month: BudgetMonth) -> None:
    """A cell's payment or income date must belong to that cell's calendar month."""
    if payload.due_date and payload.due_date[:7] != str(month.month):
        raise HTTPException(status_code=400, detail="The date must be within the cell's month.")


@router.get("")
def list_budget_months(session: Session = Depends(get_session)):
    return session.execute(select(BudgetMonth).order_by(BudgetMonth.month.desc())).scalars().all()


@router.get("/buckets")
def get_budget_buckets():
    return list_budget_buckets()


@router.get("/bucket-targets", response_model=list[BudgetBucketTargetOut])
def list_budget_bucket_targets(budget_month_id: int | None = None, session: Session = Depends(get_session)):
    query = select(BudgetBucketTarget)
    if budget_month_id:
        query = query.where(BudgetBucketTarget.budget_month_id == budget_month_id)
    rows = session.execute(query.order_by(BudgetBucketTarget.budget_bucket)).scalars().all()
    targets = []
    for target in rows:
        bucket = require_budget_bucket(target.budget_bucket)
        targets.append(
            {
                "id": target.id,
                "budget_month_id": target.budget_month_id,
                "budget_bucket": target.budget_bucket,
                "amount": target.amount,
                "rollover_amount": target.rollover_amount,
                "due_date": target.due_date,
                "future_cost": bool(target.future_cost),
                "bucket_name": bucket.name,
                "name": bucket.name,
                "type": bucket.type,
            }
        )
    return targets


@router.post("/months")
def create_budget_month(payload: BudgetMonthCreate, session: Session = Depends(get_session)):
    _require_recent_bank_refresh(session)
    month_label = payload.month.strip()
    if not month_label:
        raise HTTPException(status_code=400, detail="Month is required")
    if len(month_label) >= 7:
        month_label = month_label[:7]
    existing = session.execute(
        select(BudgetMonth).where(BudgetMonth.month == month_label).order_by(BudgetMonth.id.desc())
    ).scalars().first()
    if existing:
        existing.rollover_enabled = 1 if payload.rollover_enabled else 0
        session.commit()
        session.refresh(existing)
        return existing
    month = BudgetMonth(
        month=month_label,
        rollover_enabled=1 if payload.rollover_enabled else 0,
        created_at=_now_str(),
    )
    session.add(month)
    session.commit()
    session.refresh(month)
    return month


@router.post("/bucket-targets", response_model=BudgetBucketTargetOut)
def create_budget_bucket_target(payload: BudgetBucketTargetCreate, session: Session = Depends(get_session)):
    _require_recent_bank_refresh(session)
    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be 0 or greater")
    if payload.rollover_amount < 0:
        raise HTTPException(status_code=400, detail="Rollover must be 0 or greater")
    try:
        bucket = require_budget_bucket(payload.budget_bucket)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    month = _require_editable_budget_month(session, payload.budget_month_id)
    _validate_target_date(payload, month)
    existing = session.execute(
        select(BudgetBucketTarget).where(
            BudgetBucketTarget.budget_month_id == payload.budget_month_id,
            BudgetBucketTarget.budget_bucket == bucket.key,
        )
    ).scalars().first()
    if existing:
        existing.amount = payload.amount
        existing.rollover_amount = payload.rollover_amount
        if "due_date" in payload.model_fields_set:
            existing.due_date = payload.due_date
        if "future_cost" in payload.model_fields_set:
            existing.future_cost = int(payload.future_cost)
        session.commit()
        return existing
    target = BudgetBucketTarget(
        budget_month_id=payload.budget_month_id,
        budget_bucket=bucket.key,
        amount=payload.amount,
        rollover_amount=payload.rollover_amount,
        due_date=payload.due_date,
        future_cost=int(payload.future_cost),
    )
    session.add(target)
    session.commit()
    return target


@router.post("/bucket-targets/{target_id}", response_model=BudgetBucketTargetOut)
def update_budget_bucket_target(target_id: int, payload: BudgetBucketTargetCreate, session: Session = Depends(get_session)):
    _require_recent_bank_refresh(session)
    target = session.execute(
        select(BudgetBucketTarget).where(BudgetBucketTarget.id == target_id)
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Budget bucket target not found")
    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be 0 or greater")
    if payload.rollover_amount < 0:
        raise HTTPException(status_code=400, detail="Rollover must be 0 or greater")
    try:
        bucket = require_budget_bucket(payload.budget_bucket)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    month = _require_editable_budget_month(session, payload.budget_month_id)
    _validate_target_date(payload, month)
    target.budget_month_id = payload.budget_month_id
    target.budget_bucket = bucket.key
    target.amount = payload.amount
    target.rollover_amount = payload.rollover_amount
    if "due_date" in payload.model_fields_set:
        target.due_date = payload.due_date
    if "future_cost" in payload.model_fields_set:
        target.future_cost = int(payload.future_cost)
    session.commit()
    return target


@router.delete("/bucket-targets/{target_id}")
def delete_budget_bucket_target(target_id: int, session: Session = Depends(get_session)):
    _require_recent_bank_refresh(session)
    target = session.execute(
        select(BudgetBucketTarget).where(BudgetBucketTarget.id == target_id)
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Budget bucket target not found")
    _require_editable_budget_month(session, int(target.budget_month_id))
    session.delete(target)
    session.commit()
    return {"status": "ok"}


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()
