from typing import Optional

from pydantic import BaseModel, ConfigDict


class BudgetMonthCreate(BaseModel):
    month: str
    rollover_enabled: bool = False

class BudgetCategoryTargetCreate(BaseModel):
    budget_month_id: int
    category_id: int
    amount: float
    rollover_amount: float = 0.0

class BudgetCategoryTargetOut(BudgetCategoryTargetCreate):
    id: int
    category_name: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class BudgetBucketTargetCreate(BaseModel):
    budget_month_id: int
    budget_bucket: str
    amount: float
    rollover_amount: float = 0.0

class BudgetBucketTargetOut(BudgetBucketTargetCreate):
    id: int
    bucket_name: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

__all__ = ['BudgetMonthCreate', 'BudgetCategoryTargetCreate', 'BudgetCategoryTargetOut', 'BudgetBucketTargetCreate', 'BudgetBucketTargetOut']
