from typing import Optional

from pydantic import BaseModel, ConfigDict


class RuleCreate(BaseModel):
    name: str
    field: str
    operator: str
    value: str
    category_id: Optional[int] = None
    payee: Optional[str] = None
    memo_contains: Optional[str] = None
    is_active: bool = True

class RuleOut(RuleCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

class MerchantProfileCreate(BaseModel):
    name: str
    currency: str
    default_category_id: Optional[int] = None
    default_subcategory_id: Optional[int] = None
    default_classification: str = "Personal"
    notes: Optional[str] = None

class MerchantProfileOut(MerchantProfileCreate):
    id: int
    normalized_name: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)

class MerchantProfileUpdate(MerchantProfileCreate):
    apply_to_transactions: bool = False

class KnowledgeBaseCreate(BaseModel):
    title: str
    content: str
    tags: Optional[str] = None
    is_active: bool = True

class KnowledgeBaseOut(KnowledgeBaseCreate):
    id: int
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)

class TransactionClassifyRequest(BaseModel):
    transaction_id: Optional[int] = None
    account_id: Optional[int] = None
    description: str
    payee: Optional[str] = None
    notes: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    bank_category: Optional[str] = None
    mcc: Optional[str] = None
    pfc_primary: Optional[str] = None
    pfc_detailed: Optional[str] = None

class ClassificationResult(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    classification: str = "Personal"
    merchant_name: Optional[str] = None
    source: str
    flow_type: Optional[str] = None
    note: Optional[str] = None

class BulkClassifyRequest(BaseModel):
    transaction_ids: Optional[list[int]] = None
    force: bool = False

__all__ = ['RuleCreate', 'RuleOut', 'MerchantProfileCreate', 'MerchantProfileOut', 'MerchantProfileUpdate', 'KnowledgeBaseCreate', 'KnowledgeBaseOut', 'TransactionClassifyRequest', 'ClassificationResult', 'BulkClassifyRequest']
