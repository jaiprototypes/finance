from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class FXRate(Base):
    __tablename__ = "fx_rate"

    id = Column(Integer, primary_key=True)
    date = Column(String, nullable=False)
    aud_per_usd = Column(Float, nullable=False)
    source = Column(String)
    created_at = Column(String, nullable=False)

class FXRecommendation(Base):
    __tablename__ = "fx_recommendation"

    id = Column(Integer, primary_key=True)
    created_at = Column(String, nullable=False)
    risk_profile = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
    note = Column(Text)

class FXBacktestRun(Base):
    __tablename__ = "fx_backtest_run"

    id = Column(Integer, primary_key=True)
    created_at = Column(String, nullable=False)
    horizon_days = Column(Integer, nullable=False)
    metrics_json = Column(Text, nullable=False)

class FXSettings(Base):
    __tablename__ = "fx_settings"

    id = Column(Integer, primary_key=True)
    target_account_id = Column(Integer, ForeignKey("account.id"))
    provider = Column(String, default="manual", nullable=False)
    risk_profile = Column(String, default="neutral", nullable=False)

__all__ = ['FXRate', 'FXRecommendation', 'FXBacktestRun', 'FXSettings']
