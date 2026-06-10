from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class BudgetMonth(Base):
    __tablename__ = "budget_month"

    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    rollover_enabled = Column(Integer, default=0, nullable=False)
    created_at = Column(String, nullable=False)

class BudgetCategoryTarget(Base):
    __tablename__ = "budget_category_target"

    id = Column(Integer, primary_key=True)
    budget_month_id = Column(Integer, ForeignKey("budget_month.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    amount = Column(Float, nullable=False)
    rollover_amount = Column(Float, default=0, nullable=False)

class BudgetBucketTarget(Base):
    __tablename__ = "budget_bucket_target"

    id = Column(Integer, primary_key=True)
    budget_month_id = Column(Integer, ForeignKey("budget_month.id"), nullable=False)
    budget_bucket = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    rollover_amount = Column(Float, default=0, nullable=False)

__all__ = ['BudgetMonth', 'BudgetCategoryTarget', 'BudgetBucketTarget']
