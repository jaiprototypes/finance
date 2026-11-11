from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from .models import DebtProfile, DebtPaymentLink
from .activity import DebtActivityService
from ..ledger.models import Account
from datetime import date
from .schemas import DebtProfileCreate, DebtProfileOut, PayoffRequest, DebtPaymentLinkCreate
from .service import build_payoff_plan

router = APIRouter(prefix="/debts", tags=["debts"])


@router.get("/profiles", response_model=list[DebtProfileOut])
def list_debt_profiles(session: Session = Depends(get_session)):
    return session.execute(select(DebtProfile)).scalars().all()


@router.get("/links")
def list_payment_links(session: Session = Depends(get_session)):
    return session.execute(select(DebtPaymentLink)).scalars().all()


@router.get("/activity")
def debt_activity(as_of: date | None = None, session: Session = Depends(get_session)):
    """Read checking-derived liability activity without creating ledger entries."""
    return DebtActivityService(session, as_of=as_of).report()


@router.post("/profiles", response_model=DebtProfileOut)
def create_debt_profile(payload: DebtProfileCreate, session: Session = Depends(get_session)):
    _validate_tracking_account(session, payload)
    profile = DebtProfile(**payload.model_dump(mode="json"), created_at=_now_str())
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.post("/profiles/{profile_id}", response_model=DebtProfileOut)
def update_debt_profile(profile_id: int, payload: DebtProfileCreate, session: Session = Depends(get_session)):
    profile = session.execute(select(DebtProfile).where(DebtProfile.id == profile_id)).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Debt profile not found")
    _validate_tracking_account(session, payload)
    profile.account_id = payload.account_id
    profile.apr = payload.apr
    profile.min_payment = payload.min_payment
    profile.due_date = payload.due_date
    profile.compounding = payload.compounding
    for name in ("credit_limit", "tracking_account_id", "tracking_reference", "balance_anchor_amount", "balance_anchor_date"):
        if name in payload.model_fields_set:
            setattr(profile, name, payload.model_dump(mode="json")[name])
    session.commit()
    return profile


@router.delete("/profiles/{profile_id}")
def delete_debt_profile(profile_id: int, session: Session = Depends(get_session)):
    profile = session.execute(select(DebtProfile).where(DebtProfile.id == profile_id)).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Debt profile not found")
    session.delete(profile)
    session.commit()
    return {"status": "ok"}


@router.post("/payoff")
def payoff_plan(payload: PayoffRequest):
    return build_payoff_plan([d.model_dump() for d in payload.debts], payload.strategy, payload.extra_payment)


@router.post("/link-payment")
def link_payment(payload: DebtPaymentLinkCreate, session: Session = Depends(get_session)):
    link = DebtPaymentLink(
        transaction_id=payload.transaction_id,
        account_id=payload.account_id,
        amount=payload.amount,
    )
    session.add(link)
    session.commit()
    return {"status": "ok"}


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()


def _validate_tracking_account(session, payload):
    """A checking feed must belong to a distinct account in the loan's currency."""
    if not payload.tracking_account_id:
        return
    account = session.get(Account, payload.account_id)
    checking = session.get(Account, payload.tracking_account_id)
    if not account or not checking or account.id == checking.id or account.currency != checking.currency:
        raise HTTPException(status_code=422, detail="Tracking requires a distinct checking account in the debt currency")
