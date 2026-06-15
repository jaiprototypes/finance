from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from .models import FXRate, FXRecommendation, FXSettings
from .schemas import FXRateCreate, FXRecommendRequest, FXSettingsUpdate
from .service import ingest_rba_rates, recommend_fx

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/rates")
def list_rates(session: Session = Depends(get_session)):
    return session.execute(select(FXRate).order_by(FXRate.date)).scalars().all()


@router.post("/rates")
def add_rate(payload: FXRateCreate, session: Session = Depends(get_session)):
    rate = FXRate(
        date=payload.date,
        aud_per_usd=payload.aud_per_usd,
        source=payload.source,
        created_at=_now_str(),
    )
    session.add(rate)
    session.commit()
    return rate


@router.post("/rates/ingest")
def ingest_rates(session: Session = Depends(get_session)):
    count = ingest_rba_rates(session)
    session.commit()
    return {"inserted": count}


@router.post("/recommendations")
def fx_recommend(payload: FXRecommendRequest, session: Session = Depends(get_session)):
    result = recommend_fx(session, payload.model_dump())
    session.commit()
    return result


@router.get("/recommendations")
def list_recommendations(session: Session = Depends(get_session)):
    rows = session.execute(select(FXRecommendation).order_by(FXRecommendation.created_at.desc())).scalars().all()
    return rows


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    settings = session.execute(select(FXSettings)).scalar_one_or_none()
    if not settings:
        return {"target_account_id": None, "provider": "manual", "risk_profile": "neutral"}
    return {
        "target_account_id": settings.target_account_id,
        "provider": settings.provider,
        "risk_profile": settings.risk_profile,
    }


@router.post("/settings")
def update_settings(payload: FXSettingsUpdate, session: Session = Depends(get_session)):
    settings = session.execute(select(FXSettings)).scalar_one_or_none()
    if not settings:
        settings = FXSettings(
            target_account_id=payload.target_account_id,
            provider=payload.provider,
            risk_profile=payload.risk_profile,
        )
        session.add(settings)
    else:
        settings.target_account_id = payload.target_account_id
        settings.provider = payload.provider
        settings.risk_profile = payload.risk_profile
    session.commit()
    return {"status": "ok"}


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()

