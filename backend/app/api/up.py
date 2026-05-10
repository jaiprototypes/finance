from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import UpAccount
from ..services.invoice_tracking import auto_track_receivables
from ..services.up_client import is_configured, sync_accounts, sync_transactions

router = APIRouter(prefix="/up", tags=["up"])


@router.get("/status")
def up_status(session: Session = Depends(get_session)):
    configured = is_configured()
    account_count = session.execute(select(func.count()).select_from(UpAccount)).scalar() or 0
    return {"configured": configured, "accounts": account_count}


@router.get("/accounts")
def up_accounts(session: Session = Depends(get_session)):
    accounts = session.execute(select(UpAccount)).scalars().all()
    return [
        {
            "id": account.id,
            "up_account_id": account.up_account_id,
            "account_id": account.account_id,
            "name": account.name,
            "account_type": account.account_type,
            "ownership_type": account.ownership_type,
            "currency": account.currency,
            "current_balance": account.current_balance,
            "available_balance": account.available_balance,
            "balance_as_of": account.balance_as_of,
            "is_active": account.is_active,
            "last_synced_at": account.last_synced_at,
            "updated_at": account.updated_at,
        }
        for account in accounts
    ]


@router.post("/sync")
def up_sync(full: bool = False, session: Session = Depends(get_session)):
    if not is_configured():
        raise HTTPException(status_code=400, detail="Up Bank is not configured")
    try:
        accounts_result = sync_accounts(session)
        transactions_result = sync_transactions(session, full=full)
        tracking = auto_track_receivables(session)
        session.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"accounts": accounts_result, "transactions": transactions_result, "invoice_tracking": tracking}


@router.post("/sync-transactions")
def up_sync_transactions_only(full: bool = False, session: Session = Depends(get_session)):
    if not is_configured():
        raise HTTPException(status_code=400, detail="Up Bank is not configured")
    try:
        local_accounts = session.execute(select(func.count()).select_from(UpAccount)).scalar() or 0
        accounts_result = None
        if local_accounts == 0:
            accounts_result = sync_accounts(session)
        transactions_result = sync_transactions(session, full=full)
        tracking = auto_track_receivables(session)
        session.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"accounts": accounts_result, "transactions": transactions_result, "invoice_tracking": tracking}
