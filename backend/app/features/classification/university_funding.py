"""Mixed-purpose university receipts require transaction-specific confirmation."""

import math
import re


class UniversityFundingRule:
    """Keep Monash wages and student-loan funding out of merchant-wide guesses."""

    _merchant = re.compile(r"\bmonash\s+universit(?:y)?\b", re.IGNORECASE)

    @classmethod
    def matches(cls, payload: dict) -> bool:
        """Use positive finite bank amounts and merchant fields, never personal notes."""
        raw_amount = payload.get("amount")
        if isinstance(raw_amount, bool):
            return False
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError, OverflowError):
            return False
        return math.isfinite(amount) and amount > 0 and any(
            cls._merchant.search(str(payload.get(field) or ""))
            for field in ("payee", "description")
        )

    @staticmethod
    def review_result() -> dict:
        """Ask for the receipt's purpose without turning its size into an income rule."""
        return {
            "category_id": None,
            "category_name": None,
            "classification": "Personal",
            "source": "university_funding_review",
            "needs_review": True,
            "skip_profile": True,
            "skip_memory": True,
            "skip_agent_learning": True,
            "note": (
                "Monash pays both employment wages and student-loan funding. "
                "Confirm this receipt's purpose before counting it as income; "
                "the amount alone does not distinguish them."
            ),
        }
