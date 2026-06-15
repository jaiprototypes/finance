from typing import Optional

from pydantic import BaseModel, ConfigDict


class DebtProfileCreate(BaseModel):
    account_id: int
    apr: float
    min_payment: float
    due_date: Optional[str] = None
    compounding: str = "daily"

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
