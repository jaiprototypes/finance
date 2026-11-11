from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


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
    due_date: Optional[str] = None
    future_cost: bool = False

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value: Optional[str]) -> Optional[str]:
        """Store only canonical calendar dates; the route checks the budget month."""
        if value is not None and date.fromisoformat(value).isoformat() != value:
            raise ValueError("Use a date in YYYY-MM-DD format")
        return value


class BudgetBucketTargetOut(BudgetBucketTargetCreate):
    id: int
    bucket_name: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

__all__ = ['BudgetMonthCreate', 'BudgetCategoryTargetCreate', 'BudgetCategoryTargetOut', 'BudgetBucketTargetCreate', 'BudgetBucketTargetOut']
