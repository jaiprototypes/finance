from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class Rule(Base):
    __tablename__ = "rule"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    field = Column(String, nullable=False)
    operator = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    payee = Column(Text)
    memo_contains = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)

class MerchantProfile(Base):
    __tablename__ = "merchant_profile"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False)
    currency = Column(String, default="", nullable=False)
    default_category_id = Column(Integer, ForeignKey("category.id"))
    default_subcategory_id = Column(Integer, ForeignKey("subcategory.id"))
    default_classification = Column(String, default="Personal", nullable=False)
    notes = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class TransactionMemory(Base):
    __tablename__ = "transaction_memory"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    merchant = Column(Text)
    content = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    classification = Column(String, default="Personal", nullable=False)
    created_at = Column(String, nullable=False)

class ClassificationAudit(Base):
    __tablename__ = "classification_audit"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    source = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    classification = Column(String, default="Personal", nullable=False)
    merchant_name = Column(Text)
    note = Column(Text)
    created_at = Column(String, nullable=False)

class KnowledgeBaseEntry(Base):
    __tablename__ = "knowledge_base_entry"

    id = Column(Integer, primary_key=True)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

__all__ = ['Rule', 'MerchantProfile', 'TransactionMemory', 'ClassificationAudit', 'KnowledgeBaseEntry']
