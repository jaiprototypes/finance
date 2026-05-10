from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import PlaidAccount, PlaidItem
from ..config import PLAID_ENV, PLAID_REDIRECT_URI
from ..services.invoice_tracking import auto_track_receivables
from ..services.plaid_client import (
    create_link_token,
    create_update_link_token,
    exchange_public_token,
    is_configured,
    sync_transactions,
)

router = APIRouter(prefix="/plaid", tags=["plaid"])


@router.get("/status")
def plaid_status(session: Session = Depends(get_session)):
    configured = is_configured()
    item_count = session.execute(select(func.count()).select_from(PlaidItem)).scalar() or 0
    return {
        "configured": configured,
        "items": item_count,
        "env": PLAID_ENV,
        "redirect_uri_configured": bool(PLAID_REDIRECT_URI),
        "redirect_uri": PLAID_REDIRECT_URI or None,
    }


@router.get("/items")
def plaid_items(session: Session = Depends(get_session)):
    items = session.execute(select(PlaidItem)).scalars().all()
    return [
        {
            "id": item.id,
            "item_id": item.item_id,
            "institution_name": item.institution_name,
            "status": item.status,
            "updated_at": item.updated_at,
        }
        for item in items
    ]


@router.get("/accounts")
def plaid_accounts(session: Session = Depends(get_session)):
    accounts = session.execute(select(PlaidAccount)).scalars().all()
    return [
        {
            "id": account.id,
            "item_id": account.item_id,
            "plaid_account_id": account.plaid_account_id,
            "account_id": account.account_id,
            "name": account.name,
            "official_name": account.official_name,
            "type": account.type,
            "subtype": account.subtype,
            "mask": account.mask,
            "currency": account.currency,
            "current_balance": account.current_balance,
            "available_balance": account.available_balance,
            "balance_as_of": account.balance_as_of,
            "is_active": account.is_active,
            "updated_at": account.updated_at,
        }
        for account in accounts
    ]


@router.post("/link-token")
def plaid_link_token():
    if not is_configured():
        raise HTTPException(status_code=400, detail="Plaid is not configured")
    try:
        return create_link_token()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/link-token/update")
def plaid_update_link_token(payload: dict | None = None, session: Session = Depends(get_session)):
    if not is_configured():
        raise HTTPException(status_code=400, detail="Plaid is not configured")
    try:
        return create_update_link_token(session, (payload or {}).get("item_id"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exchange")
def plaid_exchange(payload: dict, session: Session = Depends(get_session)):
    if not is_configured():
        raise HTTPException(status_code=400, detail="Plaid is not configured")
    public_token = payload.get("public_token")
    metadata = payload.get("metadata") or {}
    if not public_token:
        raise HTTPException(status_code=400, detail="public_token is required")
    try:
        data = exchange_public_token(session, public_token, metadata)
        session.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "ok", **data}


@router.post("/sync")
def plaid_sync(full: bool = False, session: Session = Depends(get_session)):
    if not is_configured():
        raise HTTPException(status_code=400, detail="Plaid is not configured")
    try:
        result = sync_transactions(session, full=full)
        tracking = auto_track_receivables(session)
        session.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {**result, "invoice_tracking": tracking}
