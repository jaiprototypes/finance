"""Reusable details for confirmed friends and family counterparties."""

import re

from sqlalchemy.orm import Session

from ..taxonomy.models import Category
from ..taxonomy.service import FRIENDS_CATEGORY_NAME, normalize_merchant
from ..taxonomy.subcategories import ensure_subcategory


class FamilyCounterpartyRule:
    """Keep Ranier's payments and receipts together without changing categories."""

    subcategory_name = "Ranier Rorr"
    _pattern = re.compile(r"\b(?:ranier rorr|ranier dwen obar ord)\b")

    @classmethod
    def name_for(cls, payee: str | None, description: str | None = None) -> str | None:
        """Recognize either bank alias in merchant fields, ignoring unrelated notes."""
        if any(cls._pattern.search(normalize_merchant(value or "")) for value in (payee, description)):
            return cls.subcategory_name
        return None

    @classmethod
    def detail(
        cls,
        session: Session,
        category_id: int | None,
        payee: str | None,
        description: str | None = None,
    ) -> dict:
        """Add the named detail only after classification chose Friends & Family."""
        name = cls.name_for(payee, description)
        if not name or not category_id:
            return {}
        category = session.get(Category, category_id)
        if not category or category.name != FRIENDS_CATEGORY_NAME:
            return {}
        detail = ensure_subcategory(session, category_id, name)
        return {"subcategory_id": detail.id, "subcategory_name": detail.name}
