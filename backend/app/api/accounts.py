from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Account
from ..schemas import AccountCreate, AccountOut

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def list_accounts(include_inactive: bool = False, session: Session = Depends(get_session)):
    query = select(Account)
    if not include_inactive:
        query = query.where(Account.is_active == 1)
    return session.execute(query).scalars().all()


@router.post("", response_model=AccountOut)
def create_account(payload: AccountCreate, session: Session = Depends(get_session)):
    account = Account(
        name=payload.name,
        type=payload.type,
        currency=payload.currency,
        institution=payload.institution,
        note=payload.note,
        is_active=1 if payload.is_active else 0,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.post("/{account_id}")
def update_account(account_id: int, payload: AccountCreate, session: Session = Depends(get_session)):
    account = session.execute(select(Account).where(Account.id == account_id)).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.name = payload.name
    account.type = payload.type
    account.currency = payload.currency
    account.institution = payload.institution
    account.note = payload.note
    account.is_active = 1 if payload.is_active else 0
    account.updated_at = _now_str()
    session.commit()
    return {"status": "ok"}


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    account = session.execute(select(Account).where(Account.id == account_id)).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = 0
    account.updated_at = _now_str()
    session.commit()
    return {"status": "ok", "archived": True}


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
