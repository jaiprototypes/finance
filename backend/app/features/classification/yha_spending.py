"""Separate confirmed YHA hotels from food purchases with AUD amount bands."""

import math
import re

from sqlalchemy.orm import Session

from ..fx.currency import convert_amount, get_recent_fortnightly_average_aud_per_usd
from ..taxonomy.service import FOOD_CATEGORY_NAME, TRANSPORT_CATEGORY_NAME
from ..taxonomy.subcategories import ensure_subcategory


class YHALodgingRule:
    """Keep confirmed Sydney Harbour and Central hotel descriptors out of food."""

    category_name = TRANSPORT_CATEGORY_NAME
    subcategory_name = "Hotels"
    _merchant = re.compile(
        r"^\s*MS\s*\*\s*(?:SYDNEYHARBOURYHA|SYDNEYCENTRALYHA(?:\s*,\s*SYDNEY)?)[\s\\/,.;:-]*$",
        re.IGNORECASE,
    )

    @classmethod
    def matches_merchant(cls, payee: str | None, description: str | None) -> bool:
        """Match a complete bank descriptor without including other YHA venues."""
        return any(cls._merchant.fullmatch(value or "") for value in (payee, description))

    @classmethod
    def result(cls, session: Session, payload: dict, category_id: int) -> dict | None:
        """Assign hotel charges and credits together without an amount or FX rule."""
        if not cls.matches_merchant(payload.get("payee"), payload.get("description")):
            return None
        try:
            amount = float(payload.get("amount"))
        except (TypeError, ValueError):
            return None
        if not math.isfinite(amount) or amount == 0:
            return None
        detail = ensure_subcategory(session, category_id, cls.subcategory_name)
        return {
            "category_id": category_id,
            "category_name": cls.category_name,
            "subcategory_id": detail.id,
            "subcategory_name": detail.name,
            "classification": "Personal",
            "merchant_name": payload.get("payee") or payload.get("description"),
            "source": "yha_hotel_rule",
            "note": "Confirmed Sydney YHA hotel merchant, including credits",
            "skip_profile": True,
            "skip_memory": True,
        }


class YHASpendingRule:
    """Keep YHA food purchases separate from accommodation and refunds."""

    _merchant = re.compile(
        r"\b(?:y\.?h\.?a\.?|sydneycentralyha|sydneyharbouryha)\b", re.IGNORECASE,
    )

    @classmethod
    def matches_merchant(cls, payee: str | None, description: str | None) -> bool:
        """Recognize bank merchant names without using a user's freeform notes."""
        return bool(cls._merchant.search(" ".join([payee or "", description or ""])))

    @staticmethod
    def subcategory_for_amount(amount_aud: float | None) -> str | None:
        """Classify negative AUD amounts below 50; refunds remain unchanged."""
        try:
            amount = float(amount_aud)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(amount) or amount >= 0 or amount <= -50:
            return None
        return "Cafe" if amount > -10 else "Restaurants"

    @classmethod
    def name_for(cls, session: Session, payload: dict) -> str | None:
        """Use the budget's cached FX context for USD, with AUD thresholds fixed."""
        if YHALodgingRule.matches_merchant(payload.get("payee"), payload.get("description")):
            return None
        if not cls.matches_merchant(payload.get("payee"), payload.get("description")):
            return None
        try:
            amount = float(payload.get("amount"))
            currency = (payload.get("currency") or "").strip().upper()
            if not math.isfinite(amount) or amount >= 0 or currency not in {"AUD", "USD"}:
                return None
            rate = None
            if currency == "USD":
                rate = get_recent_fortnightly_average_aud_per_usd(session)["aud_per_usd"]
            amount_aud = convert_amount(amount, currency, "AUD", rate)
        except (KeyError, TypeError, ValueError):
            # Missing FX must not invent an amount or trigger network requests.
            return None
        return cls.subcategory_for_amount(amount_aud)

    @classmethod
    def result(cls, session: Session, payload: dict, food_category_id: int) -> dict | None:
        """Return a scoped food result without learning a category for all YHA."""
        name = cls.name_for(session, payload)
        if name is None:
            return None
        detail = ensure_subcategory(session, food_category_id, name)
        return {
            "category_id": food_category_id,
            "category_name": FOOD_CATEGORY_NAME,
            "subcategory_id": detail.id,
            "subcategory_name": detail.name,
            "classification": "Personal",
            "merchant_name": payload.get("payee") or payload.get("description") or "YHA",
            "source": "yha_amount_rule",
            "note": f"Matched YHA {name} spending using AUD amount bands",
            "skip_profile": True,
            "skip_memory": True,
        }
