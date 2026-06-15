from __future__ import annotations

import re
from dataclasses import asdict, dataclass

TRANSFER_CATEGORY_NAME = "Transfers"
FRIENDS_CATEGORY_NAME = "Friends & Family"
INCOME_CATEGORY_NAME = "Income"
BUSINESS_CATEGORY_NAME = "Business"
HOUSING_BILLS_CATEGORY_NAME = "Housing & Bills"
FOOD_CATEGORY_NAME = "Food"
TRANSPORT_CATEGORY_NAME = "Transport"
HEALTH_CATEGORY_NAME = "Health"
LIFESTYLE_CATEGORY_NAME = "Lifestyle"
DEBT_CATEGORY_NAME = "Debt"
SAVINGS_CATEGORY_NAME = "Savings"
CASH_ATM_CATEGORY_NAME = "Cash & ATM"
STAFFING_CATEGORY_NAME = BUSINESS_CATEGORY_NAME

ACTIVE_CATEGORY_NAMES = (
    INCOME_CATEGORY_NAME,
    BUSINESS_CATEGORY_NAME,
    HOUSING_BILLS_CATEGORY_NAME,
    FOOD_CATEGORY_NAME,
    TRANSPORT_CATEGORY_NAME,
    HEALTH_CATEGORY_NAME,
    LIFESTYLE_CATEGORY_NAME,
    DEBT_CATEGORY_NAME,
    SAVINGS_CATEGORY_NAME,
    CASH_ATM_CATEGORY_NAME,
    TRANSFER_CATEGORY_NAME,
    FRIENDS_CATEGORY_NAME,
)
BROAD_BUDGET_CATEGORIES = ACTIVE_CATEGORY_NAMES
INCOME_CATEGORY_NAMES = (INCOME_CATEGORY_NAME, BUSINESS_CATEGORY_NAME)

CATEGORY_ALIAS_MAP = {
    "adult": LIFESTYLE_CATEGORY_NAME,
    "apps games software": LIFESTYLE_CATEGORY_NAME,
    "atm": CASH_ATM_CATEGORY_NAME,
    "bars": FOOD_CATEGORY_NAME,
    "bills utilities": HOUSING_BILLS_CATEGORY_NAME,
    "booze": FOOD_CATEGORY_NAME,
    "children family": LIFESTYLE_CATEGORY_NAME,
    "client meals": FOOD_CATEGORY_NAME,
    "clothing accessories": LIFESTYLE_CATEGORY_NAME,
    "cycling": TRANSPORT_CATEGORY_NAME,
    "debt": DEBT_CATEGORY_NAME,
    "debt payments": DEBT_CATEGORY_NAME,
    "department stores": LIFESTYLE_CATEGORY_NAME,
    "discount stores": LIFESTYLE_CATEGORY_NAME,
    "education": LIFESTYLE_CATEGORY_NAME,
    "education student loans": DEBT_CATEGORY_NAME,
    "electronics": LIFESTYLE_CATEGORY_NAME,
    "entertainment subscriptions": LIFESTYLE_CATEGORY_NAME,
    "events gigs": LIFESTYLE_CATEGORY_NAME,
    "fitness wellbeing": HEALTH_CATEGORY_NAME,
    "food": FOOD_CATEGORY_NAME,
    "food dining": FOOD_CATEGORY_NAME,
    "fuel": TRANSPORT_CATEGORY_NAME,
    "gifts charity": LIFESTYLE_CATEGORY_NAME,
    "groceries": FOOD_CATEGORY_NAME,
    "hair beauty": HEALTH_CATEGORY_NAME,
    "health": HEALTH_CATEGORY_NAME,
    "health medical": HEALTH_CATEGORY_NAME,
    "health personal care": HEALTH_CATEGORY_NAME,
    "hobbies": LIFESTYLE_CATEGORY_NAME,
    "holidays travel": TRANSPORT_CATEGORY_NAME,
    "homeware appliances": HOUSING_BILLS_CATEGORY_NAME,
    "income contractor": INCOME_CATEGORY_NAME,
    "internet": HOUSING_BILLS_CATEGORY_NAME,
    "investment proceeds": INCOME_CATEGORY_NAME,
    "investments": SAVINGS_CATEGORY_NAME,
    "life admin": HOUSING_BILLS_CATEGORY_NAME,
    "lifestyle": LIFESTYLE_CATEGORY_NAME,
    "maintenance improvements": HOUSING_BILLS_CATEGORY_NAME,
    "mobile phone": HOUSING_BILLS_CATEGORY_NAME,
    "news magazines books": LIFESTYLE_CATEGORY_NAME,
    "public transport": TRANSPORT_CATEGORY_NAME,
    "pubs bars": FOOD_CATEGORY_NAME,
    "rent and utilities telephone": HOUSING_BILLS_CATEGORY_NAME,
    "rent mortgage": HOUSING_BILLS_CATEGORY_NAME,
    "restaurants": FOOD_CATEGORY_NAME,
    "restaurants cafes": FOOD_CATEGORY_NAME,
    "savings": SAVINGS_CATEGORY_NAME,
    "savings investments": SAVINGS_CATEGORY_NAME,
    "shopping lifestyle": LIFESTYLE_CATEGORY_NAME,
    "software": LIFESTYLE_CATEGORY_NAME,
    "staffing": BUSINESS_CATEGORY_NAME,
    "takeaway": FOOD_CATEGORY_NAME,
    "taxis share cars": TRANSPORT_CATEGORY_NAME,
    "technology": LIFESTYLE_CATEGORY_NAME,
    "telecom": HOUSING_BILLS_CATEGORY_NAME,
    "tobacco vaping": LIFESTYLE_CATEGORY_NAME,
    "transport": TRANSPORT_CATEGORY_NAME,
    "transportation taxis and ride shares": TRANSPORT_CATEGORY_NAME,
    "transit": TRANSPORT_CATEGORY_NAME,
    "travel": TRANSPORT_CATEGORY_NAME,
    "tv music streaming": LIFESTYLE_CATEGORY_NAME,
    "utilities": HOUSING_BILLS_CATEGORY_NAME,
}

MCC_CATEGORY_MAP: dict[str, str] = {
    "5411": FOOD_CATEGORY_NAME,
    "5812": FOOD_CATEGORY_NAME,
    "5814": FOOD_CATEGORY_NAME,
    "5541": TRANSPORT_CATEGORY_NAME,
    "5542": TRANSPORT_CATEGORY_NAME,
    "5912": HEALTH_CATEGORY_NAME,
    "5921": FOOD_CATEGORY_NAME,
    "5813": FOOD_CATEGORY_NAME,
    "5311": LIFESTYLE_CATEGORY_NAME,
    "5310": LIFESTYLE_CATEGORY_NAME,
    "5732": LIFESTYLE_CATEGORY_NAME,
    "5734": LIFESTYLE_CATEGORY_NAME,
    "4814": HOUSING_BILLS_CATEGORY_NAME,
    "4121": TRANSPORT_CATEGORY_NAME,
    "4111": TRANSPORT_CATEGORY_NAME,
    "4784": TRANSPORT_CATEGORY_NAME,
    "4900": HOUSING_BILLS_CATEGORY_NAME,
    "6010": CASH_ATM_CATEGORY_NAME,
    "6011": CASH_ATM_CATEGORY_NAME,
    "6012": TRANSFER_CATEGORY_NAME,
    "4829": TRANSFER_CATEGORY_NAME,
    "6536": TRANSFER_CATEGORY_NAME,
    "6537": TRANSFER_CATEGORY_NAME,
    "6538": TRANSFER_CATEGORY_NAME,
}


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
_EXCLUDED_CATEGORY_NAMES = {"Business", TRANSFER_CATEGORY_NAME, FRIENDS_CATEGORY_NAME, "Cash & ATM"}
_HOUSING_HINTS = ("housing", "rent", "mortgage", "utility", "utilities", "internet", "phone", "mobile", "water", "energy", "electric", "gas", "insurance", "storage")
_FOOD_HINTS = ("food", "grocery", "grocer", "restaurant", "cafe", "bar", "takeaway")
_TRANSPORT_HINTS = ("transport", "fuel", "uber", "transit", "taxi", "ride share", "cycling", "travel", "holiday", "flight", "hotel", "airbnb", "booking")
_HEALTH_HINTS = ("health", "medical", "pharmacy", "beauty", "fitness", "gym", "wellbeing")
_DEBT_HINTS = ("debt", "loan", "credit", "card", "repayment", "repay")
_SAVINGS_HINTS = ("saving", "savings", "investment", "investments", "round up", "save up")
_LIFESTYLE_HINTS = ("shopping", "entertainment", "subscription", "app", "software", "education")


def normalize_merchant(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", value or "").strip().lower()
    return re.sub(r"\s+", " ", cleaned)


def canonicalize_category_name(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    normalized = normalize_merchant(text)
    return CATEGORY_ALIAS_MAP.get(normalized, text)


def is_income_category_name(value: str | None) -> bool:
    return canonicalize_category_name(value) in INCOME_CATEGORY_NAMES


def mcc_to_category(mcc: str | int | None) -> str:
    code = str(mcc or "").strip()
    return canonicalize_category_name(MCC_CATEGORY_MAP.get(code))


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
