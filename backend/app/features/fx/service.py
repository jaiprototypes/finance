import json
from typing import Optional

import pandas as pd
from sqlalchemy import select

from shared.fx import get_rba_aud_per_usd, recommend_with_profile
from .models import FXRate, FXRecommendation


def ingest_rba_rates(session) -> int:
    series = get_rba_aud_per_usd()
    inserted = 0
    for date, value in series.items():
        row = session.execute(select(FXRate).where(FXRate.date == date.strftime("%Y-%m-%d"))).scalar_one_or_none()
        if row:
            continue
        session.add(FXRate(date=date.strftime("%Y-%m-%d"), aud_per_usd=float(value), source="rba", created_at=_now_str()))
        inserted += 1
    return inserted


def fx_series(session, limit: Optional[int] = None) -> pd.Series:
    query = select(FXRate).order_by(FXRate.date)
    if limit:
        query = query.limit(limit)
    rows = session.execute(query).scalars().all()
    data = {r.date: r.aud_per_usd for r in rows}
    if not data:
        return pd.Series(dtype=float)
    series = pd.Series(data)
    series.index = pd.to_datetime(series.index)
    return series.sort_index()


def recommend_fx(session, request: dict, loan_list: list[dict] | None = None) -> dict:
    series = fx_series(session)
    result = recommend_with_profile(
        profile=request.get("risk_profile", "neutral"),
        fx=series,
        aud_cash=request["aud_cash"],
        usd_cash=request["usd_cash"],
        aud_debt=request["aud_debt"],
        usd_debt=request["usd_debt"],
        usd_debt_apr=request["usd_debt_apr"],
        aud_debt_apr=request["aud_debt_apr"],
        history_days=request.get("history_days"),
        forecast_days=request.get("forecast_days"),
        transfer_bps=request.get("transfer_bps", 0.0005),
        loan_list=loan_list,
    )
    session.add(
        FXRecommendation(
            created_at=_now_str(),
            risk_profile=request.get("risk_profile", "neutral"),
            payload_json=json.dumps(result, ensure_ascii=True),
            note="Informational only. Not financial advice.",
        )
    )
    return result


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()


__all__ = ["ingest_rba_rates", "recommend_fx"]
