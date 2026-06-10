from typing import Optional

from pydantic import BaseModel, ConfigDict


class AccountBase(BaseModel):
    name: str
    type: str
    currency: str
    institution: Optional[str] = None
    note: Optional[str] = None
    is_active: bool = True

class AccountCreate(AccountBase):
    pass

class AccountOut(AccountBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class TransactionBase(BaseModel):
    account_id: int
    date: str
    description: str
    amount: float
    currency: str
    payee: Optional[str] = None
    notes: Optional[str] = None
    classification: str = "Personal"
    reconciliation_state: str = "imported"

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    payee: Optional[str] = None
    notes: Optional[str] = None
    classification: Optional[str] = None
    reconciliation_state: Optional[str] = None

class TransactionOut(TransactionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class TransactionSplitCreate(BaseModel):
    transaction_id: int
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    subcategory_name: Optional[str] = None
    amount: float
    currency: str
    classification: str = "Personal"
    notes: Optional[str] = None
    business_percent: Optional[float] = None

class TransactionSplitUpdate(BaseModel):
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    subcategory_name: Optional[str] = None
    classification: Optional[str] = None
    notes: Optional[str] = None
    cascade_matching_merchant: bool = True

class ReconcileUpdate(BaseModel):
    reconciliation_state: str

class MergeTransactionsRequest(BaseModel):
    primary_id: int
    duplicate_id: int

__all__ = ['AccountBase', 'AccountCreate', 'AccountOut', 'TransactionBase', 'TransactionCreate', 'TransactionUpdate', 'TransactionOut', 'TransactionSplitCreate', 'TransactionSplitUpdate', 'ReconcileUpdate', 'MergeTransactionsRequest']
