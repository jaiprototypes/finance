from typing import Optional

from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    personal_allowed: bool = True
    business_allowed: bool = True
    tax_code: Optional[str] = None
    is_active: bool = True

class SubcategoryCreate(BaseModel):
    name: str
    is_active: bool = True

class SubcategoryOut(SubcategoryCreate):
    id: int
    category_id: int

    model_config = ConfigDict(from_attributes=True)

class CategoryOut(CategoryCreate):
    id: int
    subcategories: list[SubcategoryOut] = []

    model_config = ConfigDict(from_attributes=True)

__all__ = ['CategoryCreate', 'SubcategoryCreate', 'SubcategoryOut', 'CategoryOut']
