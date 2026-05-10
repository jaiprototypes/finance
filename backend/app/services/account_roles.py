import re
from collections.abc import Mapping
from typing import Any

from ..models import Account

BUSINESS_ACCOUNT_KEYWORDS = ("business", "commercial")


class AccountRoleClassifier:
    def __init__(self, business_keywords: tuple[str, ...] = BUSINESS_ACCOUNT_KEYWORDS) -> None:
        self.business_keywords = tuple(keyword.lower() for keyword in business_keywords)

    def cash_role(self, account: Account | Mapping[str, Any] | None) -> str:
        return "business" if self.is_business(account) else "personal"

    def is_business(self, account: Account | Mapping[str, Any] | None) -> bool:
        if account is None:
            return False
        text = self._account_text(account)
        return any(keyword in text for keyword in self.business_keywords)

    def _account_text(self, account: Account | Mapping[str, Any]) -> str:
        parts = [
            self._read(account, "name", "account_name"),
            self._read(account, "institution", "institution_name"),
            self._read(account, "note", "notes"),
        ]
        return self._normalize(" ".join(part for part in parts if part))

    @staticmethod
    def _read(account: Account | Mapping[str, Any], *names: str) -> str:
        for name in names:
            value = account.get(name) if isinstance(account, Mapping) else getattr(account, name, None)
            if value:
                return str(value)
        return ""

    @staticmethod
    def _normalize(value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", value or "").strip().lower()
        return re.sub(r"\s+", " ", cleaned)


DEFAULT_ACCOUNT_ROLE_CLASSIFIER = AccountRoleClassifier()


def account_cash_role(account: Account | Mapping[str, Any] | None) -> str:
    return DEFAULT_ACCOUNT_ROLE_CLASSIFIER.cash_role(account)


def is_business_account(account: Account | Mapping[str, Any] | None) -> bool:
    return DEFAULT_ACCOUNT_ROLE_CLASSIFIER.is_business(account)
