from sqlalchemy import select
from sqlalchemy.orm import Session

from ..debts.models import DebtProfile
from ..fx.currency import ensure_recent_fx_rates, get_recent_fortnightly_average_aud_per_usd
from ..fx.models import FXRate, FXRecommendation
from ..reports.service import budget_matrix, net_worth

PLANNING_FX_RATE_LIMIT = 30


def _refresh_fx_if_needed(session: Session) -> None:
    inserted = ensure_recent_fx_rates(session)
    if inserted:
        session.commit()
    get_recent_fortnightly_average_aud_per_usd(session)


def _recent_fx_rates(session: Session) -> list[FXRate]:
    rows = session.execute(
        select(FXRate).order_by(FXRate.date.desc()).limit(PLANNING_FX_RATE_LIMIT)
    ).scalars().all()
    return list(reversed(rows))


def planning_overview(session: Session, year: int) -> dict:
    """Return the aggregate data needed by the desktop Planning workspace."""
    _refresh_fx_if_needed(session)
    return {
        "budget_matrix": budget_matrix(session, year=year),
        "net_worth": net_worth(session),
        "debt_profiles": session.execute(select(DebtProfile)).scalars().all(),
        "fx_rates": _recent_fx_rates(session),
        "fx_recommendations": session.execute(
            select(FXRecommendation).order_by(FXRecommendation.created_at.desc())
        ).scalars().all(),
    }
