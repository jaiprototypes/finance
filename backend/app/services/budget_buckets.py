from __future__ import annotations

from dataclasses import asdict, dataclass

from .classification import (
    FRIENDS_CATEGORY_NAME,
    TRANSFER_CATEGORY_NAME,
    canonicalize_category_name,
    is_income_category_name,
    normalize_merchant,
)


@dataclass(frozen=True)
class BudgetBucket:
    key: str
    name: str
    type: str
    order: int


BUDGET_BUCKETS = (
    BudgetBucket("income", "Income", "income", 0),
    BudgetBucket("housing_bills", "Housing & Bills", "expense", 10),
    BudgetBucket("food", "Food", "expense", 20),
    BudgetBucket("transport", "Transport", "expense", 30),
    BudgetBucket("health", "Health", "expense", 40),
    BudgetBucket("lifestyle", "Lifestyle", "expense", 50),
    BudgetBucket("debt", "Debt", "expense", 60),
    BudgetBucket("savings", "Savings", "expense", 70),
)

BUDGET_BUCKETS_BY_KEY = {bucket.key: bucket for bucket in BUDGET_BUCKETS}
_BUCKET_KEY_BY_CATEGORY = {
    "Income": "income",
    "Housing & Bills": "housing_bills",
    "Housing": "housing_bills",
    "Bills & Utilities": "housing_bills",
    "Food": "food",
    "Food & Dining": "food",
    "Transport": "transport",
    "Health": "health",
    "Health & Personal Care": "health",
    "Lifestyle": "lifestyle",
    "Shopping & Lifestyle": "lifestyle",
    "Entertainment & Subscriptions": "lifestyle",
    "Education": "lifestyle",
    "Debt": "debt",
    "Debt Payments": "debt",
    "Savings": "savings",
    "Savings & Investments": "savings",
    "Travel": "transport",
}
_EXCLUDED_CATEGORY_NAMES = {
    "Business",
    TRANSFER_CATEGORY_NAME,
    FRIENDS_CATEGORY_NAME,
    "Cash & ATM",
}
_HOUSING_HINTS = (
    "housing",
    "rent",
    "mortgage",
    "utility",
    "utilities",
    "internet",
    "phone",
    "mobile",
    "water",
    "energy",
    "electric",
    "gas",
    "insurance",
    "storage",
)
_FOOD_HINTS = ("food", "grocery", "grocer", "restaurant", "cafe", "bar", "takeaway")
_TRANSPORT_HINTS = ("transport", "fuel", "uber", "transit", "taxi", "ride share", "cycling", "travel", "holiday", "flight", "hotel", "airbnb", "booking")
_HEALTH_HINTS = ("health", "medical", "pharmacy", "beauty", "fitness", "gym", "wellbeing")
_DEBT_HINTS = ("debt", "loan", "credit", "card", "repayment", "repay")
_SAVINGS_HINTS = ("saving", "savings", "investment", "investments", "round up", "save up")
_LIFESTYLE_HINTS = ("shopping", "entertainment", "subscription", "app", "software", "education")


def list_budget_buckets() -> list[dict[str, str | int]]:
    return [asdict(bucket) for bucket in BUDGET_BUCKETS]


def get_budget_bucket(bucket_key: str | None) -> BudgetBucket | None:
    if not bucket_key:
        return None
    return BUDGET_BUCKETS_BY_KEY.get((bucket_key or "").strip().lower())


def require_budget_bucket(bucket_key: str | None) -> BudgetBucket:
    bucket = get_budget_bucket(bucket_key)
    if not bucket:
        raise ValueError("Unknown budget bucket")
    return bucket


def budget_bucket_key_for_category(category_name: str | None) -> str | None:
    canonical = canonicalize_category_name(category_name)
    if not canonical:
        return None
    if canonical in _EXCLUDED_CATEGORY_NAMES:
        return None
    if is_income_category_name(canonical):
        return "income"
    bucket_key = _BUCKET_KEY_BY_CATEGORY.get(canonical)
    if bucket_key:
        return bucket_key
    normalized = normalize_merchant(canonical)
    if any(token in normalized for token in _HOUSING_HINTS):
        return "housing_bills"
    if any(token in normalized for token in _FOOD_HINTS):
        return "food"
    if any(token in normalized for token in _TRANSPORT_HINTS):
        return "transport"
    if any(token in normalized for token in _HEALTH_HINTS):
        return "health"
    if any(token in normalized for token in _DEBT_HINTS):
        return "debt"
    if any(token in normalized for token in _SAVINGS_HINTS):
        return "savings"
    if any(token in normalized for token in _LIFESTYLE_HINTS):
        return "lifestyle"
    return "lifestyle"
