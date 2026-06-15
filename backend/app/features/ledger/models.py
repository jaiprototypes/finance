from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class Account(Base):
    __tablename__ = "account"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    institution = Column(String)
    note = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    date = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    payee = Column(String)
    notes = Column(Text)
    classification = Column(String, default="Personal", nullable=False)
    reconciliation_state = Column(String, default="imported", nullable=False)
    import_batch_id = Column(Integer, ForeignKey("import_batch.id"))
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class TransactionSplit(Base):
    __tablename__ = "transaction_split"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    subcategory_id = Column(Integer, ForeignKey("subcategory.id"))
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    classification = Column(String, default="Personal", nullable=False)
    notes = Column(Text)
    business_percent = Column(Float)

class TransactionTag(Base):
    __tablename__ = "transaction_tag"

    transaction_id = Column(Integer, ForeignKey("transactions.id"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tag.id"), primary_key=True)

class Attachment(Base):
    __tablename__ = "attachment"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    file_path = Column(Text, nullable=False)
    file_name = Column(Text)
    mime_type = Column(String)
    created_at = Column(String, nullable=False)

__all__ = ['Account', 'Transaction', 'TransactionSplit', 'TransactionTag', 'Attachment']
