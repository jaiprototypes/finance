"""Distinguish a payment rail from evidence of a purchase or credit repayment."""

import re


class PayPalActivity:
    """Keep generic bank references out of automatic friends/family guesses."""

    _paypal = re.compile(r"\b(?:paypal|pypl)\b", re.I)
    _credit = re.compile(
        r"\b(?:paypal|pypl)\b.*\b(?:credit\s+(?:payment|pymt|repayment)|"
        r"(?:payment|pymt|repayment)\s+(?:to\s+)?credit|pay\s*in\s*4|payin4)\b", re.I)
    _generic = re.compile(r"(?:ach\s+)?paypal(?:\s+(?:purchase|inst xfer|retry pymt|transfer))?")

    @classmethod
    def present(cls, payee, description) -> bool:
        """Recognize PayPal without using free-form notes as evidence."""
        return bool(cls._paypal.search(" ".join([payee or "", description or ""])))

    @classmethod
    def credit_payment(cls, payee, description, bank_category=None) -> bool:
        """Require credit/installment wording or loan-payment metadata."""
        text = " ".join([payee or "", description or ""])
        metadata = str(bank_category or "").upper()
        if re.search(r"\bpurchase\b", text, re.I) and not cls._credit.search(text):
            return False
        return bool(cls._credit.search(text)) or (
            cls.present(payee, description) and metadata in {
                "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT"})

    @classmethod
    def generic_reference(cls, payee, description) -> bool:
        """Bare purchase/transfer labels do not identify a recipient or purpose."""
        texts = [value for value in (payee, description) if value]
        return bool(texts) and all(cls._generic.fullmatch(
            " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())) for value in texts)

    @classmethod
    def identified_merchant(cls, payee, description) -> bool:
        """Allow vendor profiles for purchases paid through PayPal."""
        return cls.present(payee, description) and not cls.generic_reference(payee, description)

    @staticmethod
    def review_result() -> dict:
        """Require review instead of inventing purchase purpose or family support."""
        return {"category_id": None, "classification": "Personal", "source": "paypal_review",
                "needs_review": True, "clear_category": True, "skip_profile": True, "skip_memory": True,
                "note": "PayPal bank reference does not identify purchase purpose or a person"}
