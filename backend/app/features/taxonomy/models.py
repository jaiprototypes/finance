from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class Category(Base):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    personal_allowed = Column(Integer, default=1, nullable=False)
    business_allowed = Column(Integer, default=1, nullable=False)
    tax_code = Column(String)
    is_active = Column(Integer, default=1, nullable=False)

class Subcategory(Base):
    __tablename__ = "subcategory"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)

class Tag(Base):
    __tablename__ = "tag"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

__all__ = ['Category', 'Subcategory', 'Tag']
