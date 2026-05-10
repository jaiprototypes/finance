from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BudgetBucketTarget, BudgetCategoryTarget, FXRate
from .fx_service import ingest_rba_rates
from .settings import DEFAULT_BASE_CURRENCY

logger = logging.getLogger(__name__)

FORTNIGHT_WINDOW_DAYS = 14
FX_STALE_DAYS = 5
FX_LOOKUP_MAX_GAP_DAYS = 7
SUPPORTED_FX_CURRENCIES = {"USD", "AUD"}


def normalize_currency_code(value: str | None) -> str:
    return (value or "").strip().upper()


def parse_rate_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value[:10]).date()
    except ValueError:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def ensure_recent_fx_rates(session: Session, stale_after_days: int = FX_STALE_DAYS) -> int:
    latest = session.execute(select(FXRate).order_by(FXRate.date.desc())).scalars().first()
    latest_date = parse_rate_date(latest.date) if latest else None
    today = datetime.now(tz=timezone.utc).date()
    if latest_date and (today - latest_date).days <= stale_after_days:
        return 0
    try:
        inserted = ingest_rba_rates(session)
        if inserted:
            session.flush()
        return inserted
    except Exception:
        logger.warning("Unable to refresh FX rates from RBA.", exc_info=True)
        return 0


def _parsed_fx_rows(session: Session) -> list[tuple[date, float]]:
    rows = session.execute(select(FXRate).order_by(FXRate.date)).scalars().all()
    parsed_rows: list[tuple[date, float]] = []
    for row in rows:
        row_date = parse_rate_date(row.date)
        if not row_date:
            continue
        try:
            value = float(row.aud_per_usd)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        parsed_rows.append((row_date, value))
    return parsed_rows


def get_aud_per_usd_for_date(
    session: Session,
    target_date: date | str,
    *,
    max_age_days: int = FX_STALE_DAYS,
    max_gap_days: int = FX_LOOKUP_MAX_GAP_DAYS,
) -> dict[str, Any]:
    if isinstance(target_date, date):
        requested_date = target_date
    else:
        requested_date = parse_rate_date(target_date)
    if not requested_date:
        raise ValueError("FX target date is invalid")

    parsed_rows = _parsed_fx_rows(session)
    if not parsed_rows:
        raise ValueError("FX rates are not available")

    latest_date = parsed_rows[-1][0]
    today = datetime.now(tz=timezone.utc).date()
    age_days = max(0, (today - latest_date).days)
    requested_age_days = max(0, (today - requested_date).days)
    if requested_age_days <= max_age_days and requested_date > latest_date and age_days > max_age_days:
        raise ValueError(
            f"FX rates are stale (latest available {latest_date.isoformat()}); refresh is required"
        )

    best_row: tuple[date, float] | None = None
    best_direction = ""
    best_gap_days: int | None = None
    for row_date, value in parsed_rows:
        gap_days = abs((row_date - requested_date).days)
        if best_gap_days is not None and gap_days > best_gap_days:
            continue
        if best_gap_days is None or gap_days < best_gap_days:
            best_row = (row_date, value)
            best_gap_days = gap_days
            best_direction = "exact" if row_date == requested_date else ("previous" if row_date < requested_date else "next")
            continue
        if gap_days == best_gap_days and best_row and best_row[0] > requested_date and row_date <= requested_date:
            best_row = (row_date, value)
            best_direction = "previous" if row_date < requested_date else "exact"

    if best_row is None or best_gap_days is None or best_gap_days > max_gap_days:
        raise ValueError(
            f"FX rate is unavailable near {requested_date.isoformat()} (max gap {max_gap_days} days)"
        )

    return {
        "aud_per_usd": best_row[1],
        "rate_date": best_row[0].isoformat(),
        "requested_date": requested_date.isoformat(),
        "gap_days": best_gap_days,
        "match_type": best_direction,
        "latest_date": latest_date.isoformat(),
        "age_days": age_days,
    }


def get_recent_fortnightly_average_aud_per_usd(
    session: Session,
    max_age_days: int = FX_STALE_DAYS,
) -> dict[str, Any]:
    parsed_rows = _parsed_fx_rows(session)
    if not parsed_rows:
        raise ValueError("FX rates are not available")

    latest_date = parsed_rows[-1][0]
    today = datetime.now(tz=timezone.utc).date()
    age_days = max(0, (today - latest_date).days)
    if age_days > max_age_days:
        raise ValueError(
            f"FX rates are stale (latest available {latest_date.isoformat()}); refresh is required"
        )
    cutoff = latest_date - timedelta(days=FORTNIGHT_WINDOW_DAYS - 1)
    window = [value for row_date, value in parsed_rows if row_date >= cutoff]
    if not window:
        window = [parsed_rows[-1][1]]
    average = sum(window) / len(window)
    return {
        "aud_per_usd": average,
        "latest_date": latest_date.isoformat(),
        "age_days": age_days,
        "observations": len(window),
        "window_days": FORTNIGHT_WINDOW_DAYS,
    }


def convert_amount(amount: float, source_currency: str | None, target_currency: str | None, aud_per_usd: float | None) -> float:
    source = normalize_currency_code(source_currency)
    target = normalize_currency_code(target_currency)
    value = float(amount)
    if not source:
        source = DEFAULT_BASE_CURRENCY
    if not target:
        target = DEFAULT_BASE_CURRENCY
    if source == target:
        return value
    if source not in SUPPORTED_FX_CURRENCIES or target not in SUPPORTED_FX_CURRENCIES:
        raise ValueError(f"Unsupported FX conversion: {source or 'unknown'} -> {target or 'unknown'}")
    if not aud_per_usd or aud_per_usd <= 0:
        raise ValueError("AUD/USD FX reference rate is unavailable")
    if source == "AUD" and target == "USD":
        return value / aud_per_usd
    if source == "USD" and target == "AUD":
        return value * aud_per_usd
    raise ValueError(f"Unsupported FX conversion: {source} -> {target}")


def rebase_budget_targets(
    session: Session,
    source_currency: str,
    target_currency: str,
    aud_per_usd: float | None,
) -> int:
    source = normalize_currency_code(source_currency)
    target = normalize_currency_code(target_currency)
    if source == target:
        return 0
    changed = 0
    for model in (BudgetCategoryTarget, BudgetBucketTarget):
        rows = session.execute(select(model)).scalars().all()
        for row in rows:
            row.amount = round(convert_amount(row.amount or 0.0, source, target, aud_per_usd), 2)
            row.rollover_amount = round(convert_amount(row.rollover_amount or 0.0, source, target, aud_per_usd), 2)
            changed += 1
    return changed
