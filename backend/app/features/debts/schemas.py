from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DebtProfileCreate(BaseModel):
    account_id: int
    apr: float
    min_payment: float
    due_date: Optional[str] = None
    compounding: str = "daily"
    credit_limit: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    tracking_account_id: Optional[int] = None
    tracking_reference: Optional[str] = None
    balance_anchor_amount: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    balance_anchor_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_tracking(self):
        """A source reference and a real dated balance each need their matching field."""
        self.tracking_reference = (self.tracking_reference or "").strip() or None
        if bool(self.tracking_account_id) != bool(self.tracking_reference):
            raise ValueError("Tracking requires both a checking account and a loan reference")
        if (self.balance_anchor_amount is None) != (self.balance_anchor_date is None):
            raise ValueError("A verified balance requires both an amount and a date")
        return self

class DebtProfileOut(DebtProfileCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

class DebtPaymentLinkCreate(BaseModel):
    transaction_id: int
    account_id: int
    amount: float

class PayoffDebt(BaseModel):
    debt_id: str
    name: str
    balance: float
    apr: float
    min_payment: float

class PayoffRequest(BaseModel):
    strategy: str = "avalanche"
    extra_payment: float = 0.0
    debts: list[PayoffDebt]

__all__ = ['DebtProfileCreate', 'DebtProfileOut', 'DebtPaymentLinkCreate', 'PayoffDebt', 'PayoffRequest']
