"""Separate user-confirmed Grab food orders from explicitly identified rides."""

import math
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..taxonomy.models import Category
from ..taxonomy.service import FOOD_CATEGORY_NAME, TRANSPORT_CATEGORY_NAME
from ..taxonomy.subcategories import ensure_subcategory


class GrabSpendingRule:
    """Share the same scoped merchant evidence with classification and diagnostics."""

    _ride = re.compile(r"\b(?:grabtaxi|grab[\s_-]+rides)\b", re.IGNORECASE)
    _generic = re.compile(
        r"^\s*(?:grab|(?:https?://)?(?:www\.)?grab\.com/?|grab\s*\*\s*A-[A-Z0-9]+)"
        r"(?:\s*,\s*[\w .()-]+)?\s*$", re.IGNORECASE,
    )

    @classmethod
    def classification_for(cls, payload: dict) -> tuple[str, str] | None:
        """Apply the user's food default only to outgoing, identified Grab merchants."""
        try:
            amount = float(payload.get("amount"))
        except (TypeError, ValueError):
            return None
        if not math.isfinite(amount) or amount >= 0:
            return None
        merchants = [str(payload.get(field) or "") for field in ("payee", "description")]
        if any(cls._ride.search(merchant) for merchant in merchants):
            return TRANSPORT_CATEGORY_NAME, "Rideshare & Taxis"
        if any(cls._generic.fullmatch(merchant) for merchant in merchants):
            return FOOD_CATEGORY_NAME, "Takeaway"
        return None

    @staticmethod
    def _category_id(session: Session, name: str) -> int:
        """Reuse canonical categories without importing the classifier service."""
        category = session.execute(select(Category).where(Category.name == name)).scalar_one_or_none()
        if category is None:
            category = Category(name=name, personal_allowed=1, business_allowed=1, is_active=1)
            session.add(category)
            session.flush()
        return category.id

    @classmethod
    def result(cls, session: Session, payload: dict) -> dict | None:
        """Return a reusable detail without teaching one broad category for all Grab."""
        assignment = cls.classification_for(payload)
        if assignment is None:
            return None
        category_name, detail_name = assignment
        category_id = cls._category_id(session, category_name)
        detail = ensure_subcategory(session, category_id, detail_name)
        return {
            "category_id": category_id,
            "category_name": category_name,
            "subcategory_id": detail.id,
            "subcategory_name": detail.name,
            "classification": "Personal",
            "merchant_name": payload.get("payee") or payload.get("description"),
            "source": "confirmed_grab_spending",
            "note": "Explicit Grab ride descriptor" if category_name == TRANSPORT_CATEGORY_NAME
                    else "User confirmed generic Grab purchases are food orders",
            "skip_profile": True,
            "skip_memory": True,
        }
