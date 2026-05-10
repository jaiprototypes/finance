
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Literal

Currency = Literal["AUD", "USD"]

@dataclass
class Loan:
    id: Optional[int]
    name: str
    currency: Currency
    principal: float
    apr: float
    kind: str
    secured: bool = False

@dataclass
class AccountBalance:
    currency: Currency
    amount: float

@dataclass
class Payment:
    id: Optional[int]
    date: str
    loan_id: int
    amount: float
    currency: Currency
    note: str = ""

@dataclass
class Deposit:
    id: Optional[int]
    date: str
    currency: Currency
    amount: float
    note: str = ""

@dataclass
class FxPoint:
    date: str
    aud_per_usd: float
