"""Confirmed wage employers shared by classification and rule diagnostics."""

import math
import re

from ..taxonomy.service import INCOME_CATEGORY_NAME


class ConfirmedEmployerRule:
    """Limit confirmed wages to positive receipts with bank merchant evidence."""

    category_name = INCOME_CATEGORY_NAME
    _pattern = re.compile(
        r"\b(?:platinum\s+staffin(?:g)?|ironmerge\s+people|breight\s+(?:pty\.?\s+ltd|p[/.]?\s*l))\b",
        re.IGNORECASE,
    )

    @classmethod
    def matches(cls, amount, payee: str | None, description: str | None) -> bool:
        """Match the employer in either merchant field without joining partial names."""
        try:
            value = float(amount)
        except (TypeError, ValueError):
            return False
        return math.isfinite(value) and value > 0 and any(
            cls._pattern.search(identity or "") for identity in (payee, description)
        )
