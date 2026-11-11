"""Recognize separately posted bank charges without parsing fees out of purchases."""

import re


class BankFeeMatcher:
    """Keep bank fees distinct from cash withdrawals and ordinary merchant fees."""

    _fee_word = re.compile(r"\bfees?\b", re.IGNORECASE)
    _envelope = re.compile(r"\b(?:purchase|withdrawal)\b", re.IGNORECASE)
    _withdrawal_fee = re.compile(r"^\s*(?:atm|cash) withdrawal fees?\b", re.IGNORECASE)
    _operator_fee = re.compile(r"\s*operator fees?\s*", re.IGNORECASE)
    _label = re.compile(
        r"\b(?:bank|atm(?: operator)?|overdraft|dishonou?r|nsf|insufficient funds|"
        r"unpaid(?: payment)?|returned?(?: payment| item| debit)?|"
        r"(?:payment|direct debit) (?:return|returned|dishonou?r|unpaid)|"
        r"(?:monthly )?(?:account|maintenance)|foreign transaction|international transaction|wire transfer)"
        r" (?:fees?|charges?)\b",
        re.IGNORECASE,
    )

    @classmethod
    def has_fee_word(cls, description: str | None, payee: str | None = None) -> bool:
        """Protect a separately posted fee from cancellation-pair matching."""
        return bool(cls._fee_word.search(" ".join([description or "", payee or ""])))

    @classmethod
    def matches(cls, description: str | None, payee: str | None = None, bank_category: str | None = None) -> bool:
        """Recognize bank fee labels or metadata only outside purchase envelopes."""
        description = description or ""
        if cls.is_purchase_or_withdrawal(description):
            return False
        text = " ".join([description, payee or ""])
        return (cls.has_fee_metadata(bank_category) or bool(cls._label.search(text))
                or bool(cls._operator_fee.fullmatch(description)))

    @classmethod
    def is_purchase_or_withdrawal(cls, description: str | None) -> bool:
        """Distinguish the whole transaction from a standalone withdrawal fee."""
        return bool(cls._envelope.search(description or "") and not cls._withdrawal_fee.match(description or ""))

    @staticmethod
    def has_fee_metadata(bank_category: str | None) -> bool:
        """Accept bank-fee metadata with either provider separators or spaces."""
        metadata = re.sub(r"[^a-z]+", " ", (bank_category or "").lower()).strip()
        return metadata == "bank fees" or metadata.startswith("bank fees ")
