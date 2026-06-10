from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class DebtProfile(Base):
    __tablename__ = "debt_profile"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    apr = Column(Float, nullable=False)
    min_payment = Column(Float, nullable=False)
    due_date = Column(String)
    compounding = Column(String, default="daily", nullable=False)
    created_at = Column(String, nullable=False)

class DebtPaymentLink(Base):
    __tablename__ = "debt_payment_link"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    amount = Column(Float, nullable=False)

__all__ = ['DebtProfile', 'DebtPaymentLink']
