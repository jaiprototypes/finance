from typing import Optional

from pydantic import BaseModel, ConfigDict


class FXRateCreate(BaseModel):
    date: str
    aud_per_usd: float
    source: Optional[str] = None

class FXRecommendRequest(BaseModel):
    risk_profile: str = "neutral"
    aud_cash: float
    usd_cash: float
    aud_debt: float
    usd_debt: float
    usd_debt_apr: float
    aud_debt_apr: float
    history_days: Optional[int] = None
    forecast_days: Optional[int] = None
    transfer_bps: float = 0.0005

class FXSettingsUpdate(BaseModel):
    target_account_id: Optional[int] = None
    provider: str = "manual"
    risk_profile: str = "neutral"

__all__ = ['FXRateCreate', 'FXRecommendRequest', 'FXSettingsUpdate']
