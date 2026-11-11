"""Explainable food details using bank evidence and recognized merchants."""

import re

from sqlalchemy.orm import Session

from ..taxonomy.models import Category
from ..taxonomy.service import FOOD_CATEGORY_NAME, normalize_merchant
from ..taxonomy.subcategories import ensure_subcategory
from .merchant_subcategories import MERCHANT_SPENDING_RULES


class FoodSubcategoryRule:
    """Fill unassigned personal food spending without guessing unknown merchants."""

    _metadata_names = {
        "food and drink coffee": "Cafe",
        "food and drink groceries": "Groceries",
        "food and drink fast food": "Takeaway",
        "food and drink restaurant": "Restaurants",
        "groceries": "Groceries",
        "restaurants cafes": "Restaurants",
        "restaurants and cafes": "Restaurants",
        "restaurants": "Restaurants",
        "takeaway": "Takeaway",
        "pubs bars": "Bars",
        "pubs and bars": "Bars",
    }
    _mcc_names = {"5411": "Groceries", "5812": "Restaurants", "5813": "Bars", "5814": "Takeaway"}
    _merchant_names = (
        (re.compile(r"\b(?:mcdonald ?s|kfc|hungry jack ?s|guzman y gomez|schnitz|uber eats)\b"), "Takeaway"),
        (re.compile(r"\b(?:coles|aldi|iga|supermarket)\b"), "Groceries"),
    )
    _payment_terms = re.compile(
        r"\b(?:refund|reversal|repayment|returned unpaid|unpaid item|saved up|"
        r"(?:card|loan|bank) payment|payment (?:to|from)|(?:bank )?transfer (?:to|from))\b"
    )
    _payment_rails = re.compile(r"\b(?:paypal|venmo|zelle|payid|osko)\b")

    @classmethod
    def _spending_text(cls, payload: dict) -> str | None:
        """Decline existing details, credits, business activity, and payment references."""
        if payload.get("subcategory_id") or payload.get("subcategory_name"):
            return None
        if str(payload.get("classification") or "Personal").lower() != "personal":
            return None
        try:
            if not float(payload.get("amount")) < 0:
                return None
        except (TypeError, ValueError):
            return None
        text = normalize_merchant(" ".join([payload.get("payee") or "", payload.get("description") or ""]))
        return None if cls._payment_terms.search(text) else text

    @classmethod
    def _match(cls, payload: dict) -> tuple[str, str] | None:
        """Prefer confirmed merchant rules, then specific bank labels and merchant codes."""
        text = cls._spending_text(payload)
        if text is None:
            return None
        for rule in MERCHANT_SPENDING_RULES:
            if rule.category_name == FOOD_CATEGORY_NAME and rule.matches(payload.get("amount"), payload.get("payee"), payload.get("description")):
                return rule.subcategory_name, "Confirmed food merchant rule"
        for pattern, name in cls._merchant_names:
            if pattern.search(text):
                return name, "Recognized food merchant"
        if cls._payment_rails.search(text):
            return None
        for field in ("pfc_detailed", "up_category_name", "up_category_id", "bank_category"):
            label = payload.get(field)
            name = cls._metadata_names.get(normalize_merchant(str(label or "")))
            if name:
                return name, f"Bank food category: {label}"
        mcc = str(payload.get("mcc") or payload.get("merchant_category_code") or "").strip()
        if mcc in cls._mcc_names:
            return cls._mcc_names[mcc], f"Merchant category code: {mcc}"
        return None

    @classmethod
    def name_for(cls, payload: dict) -> str | None:
        """Expose the same conservative decision for classification health checks."""
        match = cls._match(payload)
        return match[0] if match else None

    @classmethod
    def detail(cls, session: Session, category_id: int | None, payload: dict) -> dict:
        """Create only a Food detail, leaving commits and category changes to the caller."""
        match = cls._match(payload)
        if not match or not category_id:
            return {}
        category = session.get(Category, category_id)
        if not category or category.name != FOOD_CATEGORY_NAME:
            return {}
        name, evidence = match
        detail = ensure_subcategory(session, category_id, name)
        return {"subcategory_id": detail.id, "subcategory_name": detail.name, "note": evidence}
