"""Deterministic merchant rules shared by import and historical classification."""

import re
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from ..taxonomy.service import (
    DEBT_CATEGORY_NAME, FOOD_CATEGORY_NAME, HOUSING_BILLS_CATEGORY_NAME,
    LIFESTYLE_CATEGORY_NAME, TRANSPORT_CATEGORY_NAME,
)
from ..taxonomy.subcategories import ensure_subcategory
from .paypal_activity import PayPalActivity


class MerchantSpendingRule:
    """Share merchant matching without learning categories from generic payees."""

    category_name = FOOD_CATEGORY_NAME
    subcategory_name: str
    _pattern: re.Pattern[str]

    @classmethod
    def matches(cls, amount: float | None, payee: str | None, description: str | None) -> bool:
        """Match whole merchant words on spending, excluding notes and inflows."""
        try:
            spending = float(amount) < 0
        except (TypeError, ValueError):
            return False
        return spending and bool(cls._pattern.search(" ".join([payee or "", description or ""])))

    @classmethod
    def result(cls, session: Session, category_id: int, merchant_name: str) -> dict:
        """Reuse a named detail without teaching broad merchant profiles."""
        detail = ensure_subcategory(session, category_id, cls.subcategory_name)
        return {
            "category_id": category_id,
            "category_name": cls.category_name,
            "subcategory_id": detail.id,
            "subcategory_name": detail.name,
            "classification": "Personal",
            "merchant_name": merchant_name,
            "source": f"{cls.subcategory_name.lower().replace(' ', '_')}_keyword",
            "note": f"Matched {cls.subcategory_name} merchant on spending",
            "skip_profile": True,
            "skip_memory": True,
        }


class CarltonTobaccoRule(MerchantSpendingRule):
    """The user's confirmed A$22 pack; other Carlton Fresh purchases remain food."""

    category_name = LIFESTYLE_CATEGORY_NAME
    subcategory_name = "Tobacco & Vaping"

    @staticmethod
    def matches_merchant(payee: str | None, description: str | None) -> bool:
        """Match only the merchant fields, never incidental notes or other Carlton shops."""
        names = {re.sub(r"[^a-z0-9]+", " ", name.lower()).strip() for name in (payee or "", description or "")}
        return bool(names & {"carlton fresh", "carlton fresh east perth"})

    @classmethod
    def matches_purchase(cls, payload: dict) -> bool:
        """Use the native AUD debit, with no converted-amount or refund matching."""
        try:
            amount = Decimal(str(payload.get("amount")))
        except (InvalidOperation, TypeError, ValueError):
            return False
        return (str(payload.get("currency") or "").upper() == "AUD" and amount.is_finite() and amount == Decimal("-22.00")
                and cls.matches_merchant(payload.get("payee"), payload.get("description")))


class CafeSpendingRule(MerchantSpendingRule):
    """Group cafe words and the user's confirmed Duotone and Belmont33 merchants."""

    subcategory_name = "Cafe"
    _pattern = re.compile(
        r"\b(?:coffee|cafe|café|duotone|belmont33\s+drive\s+th(?:r(?:u)?)?)\b",
        re.IGNORECASE,
    )


class GroceriesSpendingRule(MerchantSpendingRule):
    """Group the user's confirmed grocery merchants."""

    subcategory_name = "Groceries"
    _pattern = re.compile(r"\b(?:woolworths?|wolworths|foodies)\b", re.IGNORECASE)


class PublicTransportSpendingRule(MerchantSpendingRule):
    """Group confirmed Transperth, SmartRider and NSW public transport fares."""

    category_name = TRANSPORT_CATEGORY_NAME
    subcategory_name = "Public Transport"
    _pattern = re.compile(
        r"\b(?:transperth|smart\s*rider|transport\s+(?:for\s+)?nsw|tfnsw\s+opal)\b",
        re.IGNORECASE,
    )


class NightclubsSpendingRule(MerchantSpendingRule):
    """Use confirmed venue names without labeling unrelated saunas or steam services."""

    category_name = LIFESTYLE_CATEGORY_NAME
    subcategory_name = "Nightclubs"
    _pattern = re.compile(
        r"\b(?:mcluu\s+darling|sauna\s+x|sydney\s+sauna|ausrec\s+wa\s+pty\s+ltd)\b"
        r"|(?=.*\bausrec\b)(?=.*\bsteam\s*works\b)",
        re.IGNORECASE,
    )


class ClothingSpendingRule(MerchantSpendingRule):
    """Recognize confirmed clothing merchants without matching a person's name."""

    category_name = LIFESTYLE_CATEGORY_NAME
    subcategory_name = "Clothing"
    _pattern = re.compile(r"\b(?:peter\s+jackson\s+df|florsheim)\b", re.IGNORECASE)


class SoftwareSpendingRule(MerchantSpendingRule):
    """Keep identified OpenAI purchases separate from general lifestyle spending."""

    category_name = LIFESTYLE_CATEGORY_NAME
    subcategory_name = "Software"
    _pattern = re.compile(r"\bopenai\b", re.IGNORECASE)


class HousingSearchSpendingRule(MerchantSpendingRule):
    """Classify Flatmates platform fees by housing purpose without treating them as rent."""

    category_name = HOUSING_BILLS_CATEGORY_NAME
    subcategory_name = "Housing Search"
    _pattern = re.compile(r"\bflatmates\.com\.au\b", re.IGNORECASE)


class ImmigrationSpendingRule(MerchantSpendingRule):
    """Match the migration agency's full name and its specific truncated bank alias."""

    category_name = LIFESTYLE_CATEGORY_NAME
    subcategory_name = "Immigration & Visa"
    _pattern = re.compile(r"\bsuccess\s+migration\s+(?:australia|austasouth\s+p)\b", re.IGNORECASE)


MERCHANT_SPENDING_RULES = (
    GroceriesSpendingRule, PublicTransportSpendingRule, NightclubsSpendingRule,
    ClothingSpendingRule, SoftwareSpendingRule, HousingSearchSpendingRule,
    ImmigrationSpendingRule, CafeSpendingRule,
)


class DebtMerchantRule:
    """Retain confirmed lender subcategories on both payments and credits."""

    _lenders = ((re.compile(r"\bafter\s*pay\b", re.I), "After pay"),
                (re.compile(r"\b(?:sallie\s*mae|slmloanpmt)\b", re.I), "Student Loan"))
    _card = re.compile(r"\b(?:visa|mastercard|credit\s+card)\s+(?:payment|pymt)\b", re.I)
    _paypal_bank = re.compile(r"\bpaypal\s*[-:]?\s*(?:inst\s+xfer|retry\s+pymt)\b", re.I)

    @classmethod
    def name_for(cls, merchant_name: str, *, category_is_debt: bool = False) -> str | None:
        """Expose the lender rule for both classification and health checks."""
        for pattern, name in cls._lenders:
            if pattern.search(merchant_name or ""):
                return name
        if cls._card.search(merchant_name or ""):
            return "Credit card"
        if PayPalActivity.credit_payment(None, merchant_name):
            return "PayPal"
        if category_is_debt and cls._paypal_bank.search(merchant_name or ""):
            return "PayPal"
        return None

    @classmethod
    def detail(cls, session: Session, category_id: int, merchant_name: str) -> dict:
        """Reuse the existing After pay detail and separate student loan payments."""
        name = cls.name_for(merchant_name, category_is_debt=True)
        if name:
            detail = ensure_subcategory(session, category_id, name)
            return {"subcategory_id": detail.id, "subcategory_name": detail.name}
        return {}
