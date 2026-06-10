import logging
import re
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, text, or_
from sqlalchemy.exc import OperationalError

from ...core.classification_port import register_classification_port
from ...core.ledger_filters import is_legacy_opening as _shared_is_legacy_opening
from .models import Rule, MerchantProfile, TransactionMemory, ClassificationAudit
from ..ledger.models import Account, Transaction, TransactionSplit
from ..taxonomy.models import Category
from ..fx.currency import (
    convert_amount,
    ensure_recent_fx_rates,
    get_aud_per_usd_for_date,
)
from ..ledger.account_roles import is_business_account
from ..assistant.local_ai import LocalAIUnavailableError, call_local_json
from ..settings.service import get_classification_model, get_local_ai_enabled, get_setting
from ..taxonomy.subcategories import subcategory_name
from ..taxonomy.service import (
    ACTIVE_CATEGORY_NAMES,
    BROAD_BUDGET_CATEGORIES,
    BUSINESS_CATEGORY_NAME,
    CASH_ATM_CATEGORY_NAME,
    DEBT_CATEGORY_NAME,
    FOOD_CATEGORY_NAME,
    FRIENDS_CATEGORY_NAME,
    HEALTH_CATEGORY_NAME,
    HOUSING_BILLS_CATEGORY_NAME,
    INCOME_CATEGORY_NAME,
    LIFESTYLE_CATEGORY_NAME,
    SAVINGS_CATEGORY_NAME,
    STAFFING_CATEGORY_NAME,
    TRANSFER_CATEGORY_NAME,
    TRANSPORT_CATEGORY_NAME,
    canonicalize_category_name,
    is_income_category_name,
    mcc_to_category,
    normalize_merchant,
)

logger = logging.getLogger(__name__)

P2P_KEYWORDS = [
    "venmo",
    "zelle",
    "cash app",
    "cashapp",
    "paypal",
    "payid",
    "osko",
    "npp",
    "p2p",
]

INTERNAL_TRANSFER_KEYWORDS = [
    "internal transfer",
    "account transfer",
    "between accounts",
    "own account",
    "balance transfer",
]

TRANSFER_RAIL_KEYWORDS = [
    "transfer",
    "xfer",
    "wire",
    "swift",
    "iban",
    "sepa",
    "international transfer",
    "foreign transfer",
    "fx transfer",
    "currency transfer",
    "remit",
    "remittance",
    "wise",
    "transferwise",
    "ofx",
    "revolut",
    "currencyfair",
    "worldremit",
    "xoom",
    "remitly",
    "moneygram",
    "western union",
    "bpay",
    "payid",
    "osko",
    "npp",
]

INCOME_KEYWORDS = [
    "payroll",
    "salary",
    "paycheck",
    "wage",
    "direct deposit",
    "deposit",
    "interest",
    "dividend",
    "bonus",
    "commission",
    "stipend",
    "reimbursement",
    "refund",
    "rebate",
    "payment from",
    "paid by",
]

STAFFING_KEYWORDS = [
    "staffing",
    "staffin",
]

EMPLOYER_WAGE_KEYWORDS = [
    "sample employer",
    "payroll services pty",
    "payroll services",
]

MIXED_POSITIVE_INFLOW_KEYWORDS = [
    "sample universit",
    "mlink from",
]

KNOWN_FRIENDS_FAMILY_INFLOW_KEYWORDS = [
    "mlink from",
]

KNOWN_DEBT_COUNTERPARTIES = [
    "afterpay",
    "sallie mae",
    "visa payment",
    "mastercard payment",
    "credit card payment",
    "slmloanpmt",
    "line of credit payment",
]

INVESTMENT_PROCEEDS_KEYWORDS = [
    "investment proceeds",
    "dividend",
    "distribution",
    "capital gain",
    "fund payout",
    "sell order",
    "sale proceeds",
]

DEBT_PAYMENT_KEYWORDS = [
    "afterpay",
    "sallie mae",
    "visa payment",
    "mastercard payment",
    "credit card payment",
    "slmloanpmt",
    "loan payment",
    "student loan payment",
    "tfr to lc",
    "transfer to lc",
    "line of credit payment",
]

CASH_ATM_KEYWORDS = [
    "atm cash out",
    "international atm cash out",
    "atm operator fee",
    "operator fee",
    "cash out",
    "atm withdrawal",
    "cash withdrawal",
]

SAVINGS_KEYWORDS = [
    "round up",
    "save up",
    "saved up",
]

EDUCATION_EXPENSE_KEYWORDS = [
    "readygrad",
]

BUSINESS_EXPENSE_KEYWORDS = [
    "amazon web services",
]

TRANSFER_OVERRIDE_KEYWORDS = [
    "bank of melbourne account",
]

TRANSFER_COUNTERPARTY_KEYWORDS = [
    "jacob wicklund",
    "jacob n wicklund",
]

DEBT_COUNTERPARTY_OVERRIDE_KEYWORDS = [
    "afterpay",
]

FRIENDS_FAMILY_OVERRIDE_KEYWORDS = [
    "ranier dwen obar ord",
    "ranier rorr",
]

HOUSING_BILLS_OVERRIDE_KEYWORDS = [
    "t nguyen",
    "thi hoang phung nguyen",
]

HEALTH_OVERRIDE_KEYWORDS = [
    "belmont city medical",
]

LIFESTYLE_OVERRIDE_KEYWORDS = [
    "city electric suppl",
    "ausrec wa pty ltd",
]

BUSINESS_KEYWORDS = [
    "inc",
    "llc",
    "ltd",
    "pty",
    "corp",
    "company",
    "co",
    "bank",
    "credit",
    "university",
    "college",
    "institute",
    "hospital",
    "clinic",
    "services",
    "staffing",
    "staffin",
]

LIABILITY_ACCOUNT_TYPES = {
    "credit card",
    "loan",
    "student loan",
}
ACCOUNT_NAME_STOPWORDS = {
    "checking",
    "savings",
    "credit",
    "card",
    "loan",
    "account",
    "bank",
    "cash",
}
def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def normalize_currency(value: str | None) -> str:
    return (value or "").strip().upper()


def _can_apply_learned_category(
    category_name: str | None,
    amount: float | int | None,
    internal_transfer_match: bool,
    p2p_keyword: str | None,
    person_like: bool,
) -> bool:
    if not _allow_special_category(category_name, internal_transfer_match, p2p_keyword, person_like):
        return False
    if amount is None:
        return True
    try:
        numeric_amount = float(amount)
    except (TypeError, ValueError):
        return True
    if numeric_amount > 0:
        lowered = (canonicalize_category_name(category_name) or "").lower()
        return lowered in {
            TRANSFER_CATEGORY_NAME.lower(),
            FRIENDS_CATEGORY_NAME.lower(),
        } or is_income_category_name(category_name)
    if numeric_amount < 0 and is_income_category_name(category_name):
        return False
    return True


def _should_skip_positive_learning(category_name: str | None, amount: float | int | None, text: str) -> bool:
    try:
        numeric_amount = float(amount)
    except (TypeError, ValueError):
        return False
    if numeric_amount <= 0:
        return False
    lowered_text = (text or "").lower()
    if any(term in lowered_text for term in MIXED_POSITIVE_INFLOW_KEYWORDS):
        return True
    lowered = (canonicalize_category_name(category_name) or "").lower()
    return lowered not in {
        TRANSFER_CATEGORY_NAME.lower(),
        FRIENDS_CATEGORY_NAME.lower(),
    } and not is_income_category_name(category_name)


def _should_skip_profile_learning(
    category_name: str | None,
    merchant_name: str | None,
    description: str | None,
    payee: str | None,
    notes: str | None,
) -> bool:
    combined_lower = " ".join(
        [merchant_name or "", description or "", payee or "", notes or ""]
    ).lower()
    if (description or "").strip().lower() == "direct debit dishonour" or "dishonour" in combined_lower:
        return True
    if "operator fee" in combined_lower:
        return True
    if any(term in combined_lower for term in TRANSFER_COUNTERPARTY_KEYWORDS):
        return True
    lowered = (canonicalize_category_name(category_name) or "").lower()
    if lowered in {
        TRANSFER_CATEGORY_NAME.lower(),
        CASH_ATM_CATEGORY_NAME.lower(),
    }:
        return True
    return False


def clean_merchant(value: str) -> str:
    if not value:
        return ""
    text = value.strip()
    if not text:
        return ""
    handle_patterns = [
        r"^PAYPAL\s*\*?\s*",
        r"^VENMO\s*\*?\s*",
        r"^SQ\s*\*?\s*",
        r"^SQUARE\s*\*?\s*",
        r"^CASH APP\s*\*?\s*",
    ]
    for pattern in handle_patterns:
        if re.match(pattern, text, flags=re.IGNORECASE):
            text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
            break
    prefix_patterns = [
        r"^POS\s+",
        r"^POS PURCHASE\s+",
        r"^DEBIT\s+",
        r"^DEBIT CARD PURCHASE\s+",
        r"^CHECKCARD\s+",
        r"^CARD\s+",
        r"^VISA\s+",
        r"^MC\s+",
        r"^MASTERCARD\s+",
        r"^ACH[:\s-]+",
        r"^ACH DEBIT[:\s-]+",
        r"^ACH CREDIT[:\s-]+",
        r"^ONLINE\s+",
        r"^WEB\s+",
        r"^RECURRING\s+",
        r"^PURCHASE\s+",
        r"^PAYMENT\s+",
        r"^TRANSFER\s+",
        r"^WITHDRAWAL\s+",
        r"^ATM\s+",
        r"^REVERSAL\s+",
        r"^OSKO\s+",
        r"^PAYID\s+",
        r"^NPP\s+",
        r"^BPAY\s+",
        r"^BANK TRANSFER\s+",
        r"^INTERNET BANKING\s+",
        r"^DIRECT DEBIT\s+",
        r"^DIRECT CREDIT\s+",
        r"^EFT\s+",
        r"^FAST PAYMENT\s+",
    ]
    for pattern in prefix_patterns:
        if re.match(pattern, text, flags=re.IGNORECASE):
            text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
            break
    text = re.sub(r"\s+#?\d{3,}$", "", text)
    text = re.sub(r"\s+\d{2}/\d{2}.*$", "", text)
    text = re.sub(r"\s+\d{4,}$", "", text)
    text = re.sub(r"\s+(REF|REFERENCE|TRACE|PAYMENT ID|PAYID|OSKO|NPP)\s*[:#-]?\s*[A-Z0-9-]+$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[-/]\s*(WISE|TRANSFERWISE|PAYID|OSKO|NPP|BPAY)$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text or value.strip()


def _find_profile(session, normalized: str, currency: str | None) -> MerchantProfile | None:
    if not normalized:
        return None
    currency_norm = normalize_currency(currency)
    if currency_norm:
        return session.execute(
            select(MerchantProfile).where(
                MerchantProfile.normalized_name == normalized,
                MerchantProfile.currency == currency_norm,
            )
        ).scalar_one_or_none()
    return session.execute(
        select(MerchantProfile).where(
            MerchantProfile.normalized_name == normalized,
            or_(MerchantProfile.currency == "", MerchantProfile.currency.is_(None)),
        )
    ).scalar_one_or_none()


def _format_bank_category(value: str) -> str:
    if not value:
        return ""
    text = value.strip()
    if not text:
        return ""
    if text.isupper() or "_" in text:
        text = text.replace("_", " ").strip().title()
    return canonicalize_category_name(text)


def _mcc_to_category(mcc: str | int | None) -> str | None:
    return mcc_to_category(mcc) or None


def _find_account_mention(session, account_id: int | None, text: str) -> str | None:
    normalized_text = normalize_merchant(text)
    if not normalized_text:
        return None
    accounts = session.execute(select(Account)).scalars().all()
    for account in accounts:
        if account_id and account.id == account_id:
            continue
        name = account.name or ""
        normalized_name = normalize_merchant(name)
        if not normalized_name or normalized_name in ACCOUNT_NAME_STOPWORDS:
            continue
        if len(normalized_name) < 4:
            continue
        if normalized_name in normalized_text:
            return name
    return None


def _account_type(session, account_id: int | None) -> str:
    if not account_id:
        return ""
    account = session.execute(select(Account).where(Account.id == int(account_id))).scalar_one_or_none()
    return (account.type or "").lower() if account else ""


def _account_by_id(session, account_id: int | None) -> Account | None:
    if not account_id:
        return None
    return session.execute(select(Account).where(Account.id == int(account_id))).scalar_one_or_none()


def _is_business_account(account: Account | None) -> bool:
    return is_business_account(account)


def _is_business_account_id(session, account_id: int | None) -> bool:
    return _is_business_account(_account_by_id(session, account_id))


def _looks_like_person(value: str) -> bool:
    if not value:
        return False
    cleaned = re.sub(r"[^a-zA-Z\s]", " ", value).strip()
    if not cleaned:
        return False
    parts = [p for p in cleaned.split() if p]
    if len(parts) >= 2:
        if not all(len(p) >= 2 for p in parts[:2]):
            return False
    elif len(parts[0]) < 4:
        return False
    lowered = " ".join(parts).lower()
    if any(keyword in lowered for keyword in BUSINESS_KEYWORDS):
        return False
    return True


def _match_keyword(text: str, keywords: list[str]) -> str | None:
    for term in keywords:
        if term in text:
            return term
    return None


def _transaction_text(payee: str | None, description: str | None, notes: str | None) -> str:
    return " ".join([payee or "", description or "", notes or ""]).strip()


def _account_name(session, account_id: int | None) -> str:
    if not account_id:
        return ""
    account = session.execute(select(Account).where(Account.id == int(account_id))).scalar_one_or_none()
    return account.name or "" if account else ""


def _has_directional_transfer_language(text: str) -> bool:
    lowered = (text or "").lower()
    directional_terms = [
        "transfer to",
        "transfer from",
        "xfer to",
        "xfer from",
        "between accounts",
        "move money",
    ]
    return any(term in lowered for term in directional_terms)


def _find_opposite_transfer_account(session, payload: dict) -> Account | None:
    transaction_id = payload.get("transaction_id")
    account_id = payload.get("account_id")
    amount = payload.get("amount")
    currency = normalize_currency(payload.get("currency"))
    date_str = payload.get("date")
    if account_id is None or amount is None or not currency or not date_str:
        return None
    try:
        txn_date = datetime.fromisoformat(str(date_str)[:10])
    except ValueError:
        return None
    target_min = -float(amount) - 0.01
    target_max = -float(amount) + 0.01
    start = (txn_date - timedelta(days=1)).date().isoformat()
    end = (txn_date + timedelta(days=1)).date().isoformat()
    query = select(Transaction).where(
        Transaction.account_id != int(account_id),
        Transaction.currency == currency,
        Transaction.amount >= target_min,
        Transaction.amount <= target_max,
        Transaction.date >= start,
        Transaction.date <= end,
    )
    if transaction_id:
        query = query.where(Transaction.id != int(transaction_id))
    match = session.execute(query).scalars().first()
    if not match:
        return None
    return _account_by_id(session, match.account_id)


def _find_opposite_transfer(session, payload: dict) -> str | None:
    account = _find_opposite_transfer_account(session, payload)
    return account.name if account else None


def _find_cross_currency_transfer(session, payload: dict) -> dict | None:
    transaction_id = payload.get("transaction_id")
    account_id = payload.get("account_id")
    amount = payload.get("amount")
    source_currency = normalize_currency(payload.get("currency"))
    date_str = payload.get("date")
    if account_id is None or amount is None or not source_currency or not date_str:
        return None
    try:
        txn_date = datetime.fromisoformat(str(date_str)[:10]).date()
        source_amount_abs = abs(float(amount))
    except (TypeError, ValueError):
        return None
    if source_currency not in {"USD", "AUD"}:
        return None
    try:
        fx_summary = get_aud_per_usd_for_date(session, txn_date)
    except ValueError:
        ensure_recent_fx_rates(session)
        try:
            fx_summary = get_aud_per_usd_for_date(session, txn_date)
        except ValueError:
            return None

    current_text = _transaction_text(
        payload.get("payee"),
        payload.get("description"),
        payload.get("notes"),
    )
    current_text_normalized = normalize_merchant(current_text)
    current_merchant_normalized = normalize_merchant(
        clean_merchant(payload.get("payee") or payload.get("description") or "")
    )
    current_account_name = _account_name(session, account_id)
    current_account_normalized = normalize_merchant(current_account_name)
    rail_hit_current = _match_keyword(current_text.lower(), TRANSFER_RAIL_KEYWORDS)
    current_reviewed_transfer = _matches_transfer_rule(
        session,
        {
            "description": payload.get("description"),
            "payee": payload.get("payee"),
            "notes": payload.get("notes"),
            "merchant": clean_merchant(payload.get("payee") or payload.get("description") or ""),
        },
    )

    start = (txn_date - timedelta(days=3)).isoformat()
    end = (txn_date + timedelta(days=3)).isoformat()
    candidates = session.execute(
        select(Transaction).where(
            Transaction.account_id != int(account_id),
            Transaction.date >= start,
            Transaction.date <= end,
        )
    ).scalars().all()

    best_match: dict | None = None
    best_sort_key: tuple[int, float, int] | None = None
    for candidate in candidates:
        if transaction_id and candidate.id == int(transaction_id):
            continue
        candidate_currency = normalize_currency(candidate.currency)
        if candidate_currency == source_currency or candidate_currency not in {"USD", "AUD"}:
            continue
        if float(candidate.amount or 0.0) == 0.0 or float(amount) == 0.0:
            continue
        if candidate.amount * float(amount) >= 0:
            continue

        candidate_text = _transaction_text(candidate.payee, candidate.description, candidate.notes)
        candidate_text_normalized = normalize_merchant(candidate_text)
        candidate_merchant_normalized = normalize_merchant(
            clean_merchant(candidate.payee or candidate.description or "")
        )
        candidate_account_name = _account_name(session, candidate.account_id)
        candidate_account_normalized = normalize_merchant(candidate_account_name)
        rail_hit_candidate = _match_keyword(candidate_text.lower(), TRANSFER_RAIL_KEYWORDS)
        candidate_reviewed_transfer = False
        if rail_hit_current or rail_hit_candidate:
            candidate_reviewed_transfer = _matches_transfer_rule(
                session,
                {
                    "description": candidate.description,
                    "payee": candidate.payee,
                    "notes": candidate.notes,
                    "merchant": clean_merchant(candidate.payee or candidate.description or ""),
                },
            )

        try:
            expected_amount = abs(
                convert_amount(
                    source_amount_abs,
                    source_currency,
                    candidate_currency,
                    fx_summary.get("aud_per_usd"),
                )
            )
        except ValueError:
            continue
        candidate_amount_abs = abs(float(candidate.amount or 0.0))
        diff = abs(candidate_amount_abs - expected_amount)
        tolerance = max(10.0, expected_amount * 0.08)
        if diff > tolerance:
            continue

        outbound_amount_abs = source_amount_abs
        outbound_currency = source_currency
        inbound_amount_abs = candidate_amount_abs
        inbound_currency = candidate_currency
        if float(amount) > 0 and float(candidate.amount or 0.0) < 0:
            outbound_amount_abs = candidate_amount_abs
            outbound_currency = candidate_currency
            inbound_amount_abs = source_amount_abs
            inbound_currency = source_currency
        try:
            expected_outbound_amount = abs(
                convert_amount(
                    inbound_amount_abs,
                    inbound_currency,
                    outbound_currency,
                    fx_summary.get("aud_per_usd"),
                )
            )
        except ValueError:
            expected_outbound_amount = outbound_amount_abs
        implied_fee_outbound = max(0.0, outbound_amount_abs - expected_outbound_amount)
        implied_fee_inbound = 0.0
        if implied_fee_outbound > 0.0:
            try:
                implied_fee_inbound = abs(
                    convert_amount(
                        implied_fee_outbound,
                        outbound_currency,
                        inbound_currency,
                        fx_summary.get("aud_per_usd"),
                    )
                )
            except ValueError:
                implied_fee_inbound = 0.0

        mention_other_account = bool(
            candidate_account_normalized and candidate_account_normalized in current_text_normalized
        )
        mention_current_account = bool(
            current_account_normalized and current_account_normalized in candidate_text_normalized
        )
        direction_hit = _has_directional_transfer_language(current_text) or _has_directional_transfer_language(candidate_text)
        merchant_exact_match = bool(
            current_merchant_normalized
            and candidate_merchant_normalized
            and current_merchant_normalized == candidate_merchant_normalized
        )
        merchant_contained_match = bool(
            current_merchant_normalized
            and candidate_merchant_normalized
            and min(len(current_merchant_normalized), len(candidate_merchant_normalized)) >= 8
            and (
                current_merchant_normalized in candidate_merchant_normalized
                or candidate_merchant_normalized in current_merchant_normalized
            )
        )
        score = 0
        if mention_other_account:
            score += 3
        if mention_current_account:
            score += 3
        if merchant_exact_match:
            score += 4
        elif merchant_contained_match and (rail_hit_current or rail_hit_candidate):
            score += 3
        if rail_hit_current and candidate_reviewed_transfer:
            score += 4
        if rail_hit_candidate and current_reviewed_transfer:
            score += 4
        if rail_hit_current or rail_hit_candidate:
            score += 1
        if direction_hit:
            score += 1
        if score <= 0:
            continue
        day_delta = abs((datetime.fromisoformat(candidate.date[:10]).date() - txn_date).days)
        if score == 1 and day_delta > 1:
            continue
        if merchant_exact_match and day_delta > 2:
            continue
        if merchant_contained_match and not merchant_exact_match and day_delta > 1:
            continue

        sort_key = (-score, diff, day_delta)
        if best_sort_key is None or sort_key < best_sort_key:
            note_bits = [f"Matched cross-currency owned-account transfer in {candidate_account_name}"]
            note_bits.append(
                f"expected≈{expected_amount:.2f} {candidate_currency}, actual={candidate_amount_abs:.2f} {candidate_currency}"
            )
            note_bits.append(
                f"fx={fx_summary.get('aud_per_usd'):.4f} AUD/USD as of {fx_summary.get('rate_date')}"
            )
            if fx_summary.get("gap_days"):
                note_bits.append(
                    f"fx_lookup={fx_summary.get('match_type')} ({fx_summary.get('gap_days')}d gap)"
                )
            if implied_fee_outbound > 0.01:
                note_bits.append(
                    f"implied_fee≈{implied_fee_outbound:.2f} {outbound_currency}"
                    + (
                        f" ({implied_fee_inbound:.2f} {inbound_currency})"
                        if implied_fee_inbound > 0.01
                        else ""
                    )
                )
            if merchant_exact_match:
                note_bits.append("counterparty_match=exact")
            elif merchant_contained_match:
                note_bits.append("counterparty_match=contained")
            if rail_hit_current and candidate_reviewed_transfer:
                note_bits.append("counterparty_rule=transfer")
            elif rail_hit_candidate and current_reviewed_transfer:
                note_bits.append("source_rule=transfer")
            if rail_hit_current or rail_hit_candidate:
                note_bits.append(f"rail={rail_hit_current or rail_hit_candidate}")
            best_sort_key = sort_key
            best_match = {
                "account_name": candidate_account_name,
                "note": "; ".join(note_bits),
                "implied_fee_amount": round(implied_fee_outbound, 2),
                "implied_fee_currency": outbound_currency,
            }
    return best_match


def _allow_special_category(category_name: str | None, internal_transfer_match: bool, p2p_keyword: str | None, person_like: bool) -> bool:
    lowered = (category_name or "").strip().lower()
    if not lowered:
        return True
    if lowered == TRANSFER_CATEGORY_NAME.lower():
        return internal_transfer_match
    if lowered == FRIENDS_CATEGORY_NAME.lower():
        return False
    return True


def _transfer_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, TRANSFER_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": TRANSFER_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or "Transfer",
        "source": source,
        "note": note,
        "skip_profile": True,
        "skip_memory": True,
        "flow_type": "internal_transfer",
    }


def _friend_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, FRIENDS_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": FRIENDS_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or "Friends & Family",
        "source": source,
        "note": note,
        "skip_profile": True,
        "skip_memory": True,
        "flow_type": "external_p2p",
    }


def _income_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, INCOME_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": INCOME_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or "Income",
        "source": source,
        "note": note,
    }


def _cash_atm_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, CASH_ATM_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": CASH_ATM_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or CASH_ATM_CATEGORY_NAME,
        "source": source,
        "note": note,
        "skip_profile": True,
        "skip_memory": True,
        "flow_type": "cash_movement",
    }


def _debt_payment_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_name = DEBT_CATEGORY_NAME
    category_id = _ensure_category(session, category_name)
    return {
        "category_id": category_id,
        "category_name": category_name,
        "classification": "Personal",
        "merchant_name": merchant_name or category_name,
        "source": source,
        "note": note,
    }


def _housing_bills_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, HOUSING_BILLS_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": HOUSING_BILLS_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or HOUSING_BILLS_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _savings_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, SAVINGS_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": SAVINGS_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or SAVINGS_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _lifestyle_result(
    session,
    merchant_name: str,
    source: str,
    note: str | None = None,
    classification: str = "Personal",
) -> dict:
    category_id = _ensure_category(session, LIFESTYLE_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": LIFESTYLE_CATEGORY_NAME,
        "classification": classification,
        "merchant_name": merchant_name or LIFESTYLE_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _health_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, HEALTH_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": HEALTH_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or HEALTH_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _business_result(
    session, merchant_name: str, source: str, note: str | None = None
) -> dict:
    category_id = _ensure_category(session, BUSINESS_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": BUSINESS_CATEGORY_NAME,
        "classification": "Business",
        "merchant_name": merchant_name or BUSINESS_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _business_owner_income_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, INCOME_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": INCOME_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or "Business payroll/reimbursement",
        "source": source,
        "note": note,
        "skip_profile": True,
        "skip_memory": True,
        "flow_type": "business_owner_distribution",
    }


def _investment_proceeds_result(
    session, merchant_name: str, source: str, note: str | None = None
) -> dict:
    category_id = _ensure_category(session, INCOME_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": INCOME_CATEGORY_NAME,
        "classification": "Personal",
        "merchant_name": merchant_name or INCOME_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _staffing_result(session, merchant_name: str, source: str, note: str | None = None) -> dict:
    category_id = _ensure_category(session, STAFFING_CATEGORY_NAME)
    return {
        "category_id": category_id,
        "category_name": STAFFING_CATEGORY_NAME,
        "classification": "Business",
        "merchant_name": merchant_name or STAFFING_CATEGORY_NAME,
        "source": source,
        "note": note,
    }


def _positive_inflow_override(
    session,
    account_id: int | None,
    amount: float | int | None,
    cleaned_merchant: str,
    payee: str,
    description: str,
    notes: str,
) -> dict | None:
    try:
        numeric_amount = float(amount)
    except (TypeError, ValueError):
        return None
    if numeric_amount <= 0:
        return None
    merchant_name = cleaned_merchant or payee or description
    combined_lower = " ".join([merchant_name, payee, description, notes]).lower()
    if _is_business_account_id(session, account_id):
        return _business_result(
            session,
            merchant_name,
            "business_account_inflow",
            note="Positive inflow landed in a business-designated account",
        )
    if any(term in combined_lower for term in INVESTMENT_PROCEEDS_KEYWORDS):
        return _investment_proceeds_result(
            session,
            merchant_name,
            "investment_proceeds_keyword",
            note="Matched explicit investment proceeds language on positive inflow",
        )
    if any(term in combined_lower for term in KNOWN_DEBT_COUNTERPARTIES):
        return _debt_payment_result(
            session,
            merchant_name,
            "debt_servicer_inflow",
            note="Matched known debt servicer on positive inflow; treated as debt activity instead of income",
        )
    if any(term in combined_lower for term in EMPLOYER_WAGE_KEYWORDS):
        return _income_result(
            session,
            merchant_name,
            "employer_keyword",
            note="Matched known wage employer on positive inflow",
        )
    if any(term in combined_lower for term in KNOWN_FRIENDS_FAMILY_INFLOW_KEYWORDS):
        return _business_result(
            session,
            merchant_name,
            "known_business_inflow",
            note="Known counterparty defaults to business income without Wise-linked support validation",
        )
    if "sample universit" in combined_lower:
        if numeric_amount >= 1000:
            category_name = DEBT_CATEGORY_NAME
            category_id = _ensure_category(session, category_name)
            return {
                "category_id": category_id,
                "category_name": category_name,
                "classification": "Personal",
                "merchant_name": merchant_name,
                "source": "student_loan_disbursement",
                "note": "Large sample university inflow treated as debt funding instead of budget income",
                "skip_profile": True,
                "skip_memory": True,
            }
        return _income_result(
            session,
            merchant_name,
            "employer_keyword",
            note="Small sample university inflow treated as wage income",
        )
    return None


def _merchant_override_result(
    session,
    amount: float | int | None,
    cleaned_merchant: str,
    payee: str,
    description: str,
    notes: str,
) -> dict | None:
    merchant_name = cleaned_merchant or payee or description
    combined_lower = " ".join([merchant_name, payee, description, notes]).lower()
    if any(term in combined_lower for term in DEBT_COUNTERPARTY_OVERRIDE_KEYWORDS):
        return _debt_payment_result(
            session,
            merchant_name,
            "debt_counterparty_override",
            note="Matched reviewed debt counterparty",
        )
    if any(term in combined_lower for term in TRANSFER_COUNTERPARTY_KEYWORDS):
        return _transfer_result(
            session,
            merchant_name,
            "transfer_counterparty_override",
            note="Matched reviewed transfer-only counterparty",
        )
    if any(term in combined_lower for term in FRIENDS_FAMILY_OVERRIDE_KEYWORDS):
        return _friend_result(
            session,
            merchant_name,
            "friends_family_counterparty_override",
            note="Matched reviewed friends/family support counterparty",
        )
    if any(term in combined_lower for term in HOUSING_BILLS_OVERRIDE_KEYWORDS):
        return _housing_bills_result(
            session,
            merchant_name,
            "housing_counterparty_override",
            note="Matched reviewed housing counterparty including refunds/payments",
        )
    if any(term in combined_lower for term in HEALTH_OVERRIDE_KEYWORDS):
        return _health_result(
            session,
            merchant_name,
            "health_counterparty_override",
            note="Matched reviewed health merchant override",
        )
    if any(term in combined_lower for term in LIFESTYLE_OVERRIDE_KEYWORDS):
        return _lifestyle_result(
            session,
            merchant_name,
            "lifestyle_counterparty_override",
            note="Matched reviewed lifestyle merchant override",
        )
    return None


def _rule_matches(rule: Rule, payload: dict) -> bool:
    field_value = str(payload.get(rule.field or "", "") or "").lower()
    value = str(rule.value or "").lower()
    if not field_value or not value:
        return False
    op = (rule.operator or "contains").lower()
    if op == "equals":
        return field_value == value
    if op == "starts_with":
        return field_value.startswith(value)
    if op == "ends_with":
        return field_value.endswith(value)
    return value in field_value


def _find_rule_category(session, payload: dict) -> Optional[int]:
    rules = session.execute(select(Rule).where(Rule.is_active == 1)).scalars().all()
    for rule in rules:
        if _rule_matches(rule, payload):
            return rule.category_id
    return None


def _matches_transfer_rule(session, payload: dict) -> bool:
    category_id = _find_rule_category(session, payload)
    if not category_id:
        return False
    return (_category_name(session, category_id) or "").lower() == TRANSFER_CATEGORY_NAME.lower()


def _search_memory(session, query: str) -> list[dict]:
    tokens = re.findall(r"[a-z0-9]+", query.lower())
    if not tokens:
        return []
    fts_query = " OR ".join(tokens[:8])
    try:
        rows = session.execute(
            text(
                """
                SELECT tm.category_id, tm.classification, tm.merchant, tm.content
                FROM transaction_memory tm
                JOIN transaction_memory_fts ON tm.id = transaction_memory_fts.rowid
                WHERE transaction_memory_fts MATCH :q
                LIMIT 6
                """
            ),
            {"q": fts_query},
        ).mappings().all()
    except OperationalError:
        logger.warning("FTS memory search failed", exc_info=True)
        return []
    return [dict(r) for r in rows]


def _search_knowledge(session, query: str) -> list[dict]:
    tokens = re.findall(r"[a-z0-9]+", query.lower())
    if not tokens:
        return []
    fts_query = " OR ".join(tokens[:8])
    try:
        rows = session.execute(
            text(
                """
                SELECT k.title, k.content, k.tags
                FROM knowledge_base_entry k
                JOIN knowledge_base_fts ON k.id = knowledge_base_fts.rowid
                WHERE k.is_active = 1 AND knowledge_base_fts MATCH :q
                LIMIT 4
                """
            ),
            {"q": fts_query},
        ).mappings().all()
    except OperationalError:
        logger.warning("FTS knowledge search failed", exc_info=True)
        return []
    return [dict(r) for r in rows]


def _local_ai_call(session, prompt: str) -> Optional[dict]:
    try:
        return call_local_json(
            session,
            system_prompt="You are a finance categorization assistant. Use only the supplied transaction evidence.",
            user_prompt=prompt,
            max_tokens=220,
        )
    except LocalAIUnavailableError:
        logger.warning("Local AI categorization is unavailable.", exc_info=True)
        return None
    except Exception:
        logger.warning("Local AI categorization returned an unusable response.", exc_info=True)
        return None


def _ensure_category(session, name: str) -> Optional[int]:
    if not name:
        return None
    canonical_name = canonicalize_category_name(name)
    row = session.execute(select(Category).where(Category.name == canonical_name)).scalar_one_or_none()
    if row:
        return row.id
    category = Category(
        name=canonical_name,
        personal_allowed=1,
        business_allowed=1,
        tax_code=None,
        is_active=1,
    )
    session.add(category)
    session.flush()
    return category.id


def _seed_default_categories(session) -> None:
    for name in BROAD_BUDGET_CATEGORIES:
        _ensure_category(session, name)


def is_legacy_opening_transaction(description: str | None, notes: str | None, payee: str | None) -> bool:
    return _shared_is_legacy_opening(description, notes, payee)


def build_transaction_payload(session, txn: Transaction) -> dict:
    payload = {
        "transaction_id": txn.id,
        "account_id": txn.account_id,
        "description": txn.description,
        "payee": txn.payee,
        "notes": txn.notes,
        "amount": txn.amount,
        "currency": txn.currency,
        "date": txn.date,
    }
    plaid = session.execute(
        text(
            """
            SELECT merchant_category_code, pfc_primary, pfc_detailed
            FROM plaid_transaction
            WHERE transaction_id = :transaction_id
            """
        ),
        {"transaction_id": txn.id},
    ).mappings().first()
    if plaid:
        payload["mcc"] = plaid.get("merchant_category_code")
        payload["pfc_primary"] = plaid.get("pfc_primary")
        payload["pfc_detailed"] = plaid.get("pfc_detailed")
    up = session.execute(
        text(
            """
            SELECT up_category_name, up_category_id
            FROM up_transaction
            WHERE transaction_id = :transaction_id
            """
        ),
        {"transaction_id": txn.id},
    ).mappings().first()
    if up:
        if up.get("up_category_name"):
            payload["bank_category"] = up.get("up_category_name")
        elif up.get("up_category_id"):
            payload["bank_category"] = up.get("up_category_id")
    return payload


def classify_payload(session, payload: dict) -> dict:
    description = payload.get("description") or ""
    payee = payload.get("payee") or ""
    notes = payload.get("notes") or ""
    amount = payload.get("amount")
    currency = payload.get("currency") or ""
    amount_label = "unknown"
    if amount is not None:
        amount_label = f"{amount} {currency}".strip()
    bank_category = payload.get("bank_category")
    pfc_primary = payload.get("pfc_primary")
    pfc_detailed = payload.get("pfc_detailed")
    mcc = payload.get("mcc")
    raw_merchant = payee or description
    cleaned_merchant = clean_merchant(raw_merchant)
    combined = " ".join([cleaned_merchant, payee, description, notes]).strip()
    combined_lower = combined.lower()
    normalized = normalize_merchant(raw_merchant)
    person_like = _looks_like_person(cleaned_merchant or payee or description)

    bank_category_name = _format_bank_category(
        bank_category or pfc_detailed or pfc_primary
    )
    mcc_category = _mcc_to_category(mcc)
    transfer_text = _transaction_text(payee, description, notes)
    transfer_lower = transfer_text.lower()
    internal_transfer_hit = _match_keyword(transfer_lower, INTERNAL_TRANSFER_KEYWORDS)
    rail_keyword_hit = _match_keyword(transfer_lower, TRANSFER_RAIL_KEYWORDS)
    p2p_hit = _match_keyword(combined_lower, P2P_KEYWORDS)
    account_mention = _find_account_mention(session, payload.get("account_id"), transfer_text)
    same_currency_transfer_account = _find_opposite_transfer_account(session, payload)
    same_currency_match = same_currency_transfer_account.name if same_currency_transfer_account else None
    cross_currency_match = _find_cross_currency_transfer(session, payload)
    bank_transfer_hint = bool(bank_category_name and "transfer" in bank_category_name.lower())
    mcc_transfer_hint = bool(mcc_category and "transfer" in mcc_category.lower())

    current_account = _account_by_id(session, payload.get("account_id"))
    current_account_is_business = _is_business_account(current_account)

    business_owner_transfer_result = None
    try:
        numeric_amount = float(amount or 0.0)
    except (TypeError, ValueError):
        numeric_amount = 0.0
    if same_currency_transfer_account:
        opposite_account_is_business = _is_business_account(same_currency_transfer_account)
        if current_account_is_business and not opposite_account_is_business and numeric_amount < 0:
            business_owner_transfer_result = _business_result(
                session,
                cleaned_merchant or payee or description,
                "business_owner_transfer",
                note=f"Business account transfer to {same_currency_transfer_account.name}; treating as owner payroll/reimbursement expense",
            )
            business_owner_transfer_result["skip_profile"] = True
            business_owner_transfer_result["skip_memory"] = True
            business_owner_transfer_result["flow_type"] = "business_owner_distribution"
        elif opposite_account_is_business and not current_account_is_business and numeric_amount > 0:
            business_owner_transfer_result = _business_owner_income_result(
                session,
                cleaned_merchant or payee or description,
                "business_owner_income",
                note=f"Received from business account {same_currency_transfer_account.name}; treating as owner payroll/reimbursement income",
            )

    internal_transfer_result = None
    if same_currency_match:
        internal_transfer_result = _transfer_result(
            session,
            cleaned_merchant or payee or description,
            "transfer_match",
            note=f"Matched opposite transfer in {same_currency_match}",
        )
    elif cross_currency_match:
        internal_transfer_result = _transfer_result(
            session,
            cleaned_merchant or payee or description,
            "transfer_fx_match",
            note=cross_currency_match["note"],
        )
    elif account_mention and (_has_directional_transfer_language(transfer_text) or internal_transfer_hit):
        internal_transfer_result = _transfer_result(
            session,
            cleaned_merchant or payee or description,
            "transfer_account",
            note=f"Mentions owned account: {account_mention}",
        )
    ambiguous_transfer_like = not internal_transfer_result and bool(
        bank_transfer_hint or mcc_transfer_hint or rail_keyword_hit or p2p_hit
    )

    known_support_counterparty = False
    try:
        known_support_counterparty = float(amount or 0.0) > 0 and any(
            term in combined_lower for term in KNOWN_FRIENDS_FAMILY_INFLOW_KEYWORDS
        )
    except (TypeError, ValueError):
        known_support_counterparty = False

    if known_support_counterparty and cross_currency_match:
        return _friend_result(
            session,
            cleaned_merchant or payee or description,
            "wise_validated_support_payment",
            note="Known support counterparty with Wise-linked validation",
        )

    merchant_override = _merchant_override_result(
        session,
        amount,
        cleaned_merchant,
        payee,
        description,
        notes,
    )
    if merchant_override:
        return merchant_override

    if business_owner_transfer_result:
        return business_owner_transfer_result

    if internal_transfer_result:
        return internal_transfer_result

    rule_category = _find_rule_category(
        session,
        {"description": description, "payee": payee, "notes": notes, "merchant": cleaned_merchant},
    )
    if rule_category:
        category_name = _category_name(session, rule_category)
        result = {
            "category_id": rule_category,
            "category_name": category_name,
            "classification": "Personal",
            "merchant_name": cleaned_merchant or payee or description,
            "source": "rule",
        }
        if category_name == TRANSFER_CATEGORY_NAME:
            result["skip_profile"] = True
            result["skip_memory"] = True
            result["flow_type"] = "internal_transfer"
        elif category_name == FRIENDS_CATEGORY_NAME:
            result["skip_profile"] = True
            result["skip_memory"] = True
            result["flow_type"] = "external_p2p"
        return result

    positive_inflow_override = _positive_inflow_override(
        session,
        payload.get("account_id"),
        amount,
        cleaned_merchant,
        payee,
        description,
        notes,
    )
    if positive_inflow_override:
        return positive_inflow_override

    account_type = _account_type(session, payload.get("account_id"))
    cash_atm_hit = None
    debt_payment_hit = None
    try:
        numeric_amount = float(amount or 0.0)
        transfer_override_hit = _match_keyword(combined_lower, TRANSFER_OVERRIDE_KEYWORDS)
        if transfer_override_hit:
            return _transfer_result(
                session,
                cleaned_merchant or payee or description,
                "transfer_override_keyword",
                note=f"Matched transfer override keyword: {transfer_override_hit}",
            )
        cash_atm_hit = _match_keyword(combined_lower, CASH_ATM_KEYWORDS)
        if numeric_amount < 0 and (cash_atm_hit or mcc_category == CASH_ATM_CATEGORY_NAME):
            return _cash_atm_result(
                session,
                cleaned_merchant or payee or description,
                "cash_atm_keyword" if cash_atm_hit else "cash_atm_mcc",
                note=(
                    f"Matched cash/ATM keyword: {cash_atm_hit}"
                    if cash_atm_hit
                    else f"MCC {mcc} resolved to {CASH_ATM_CATEGORY_NAME}"
                ),
            )
        savings_hit = _match_keyword(combined_lower, SAVINGS_KEYWORDS)
        if savings_hit:
            return _savings_result(
                session,
                cleaned_merchant or payee or description,
                "savings_keyword",
                note=f"Matched savings keyword: {savings_hit}",
            )
        education_hit = _match_keyword(combined_lower, EDUCATION_EXPENSE_KEYWORDS)
        if education_hit:
            return _lifestyle_result(
                session,
                cleaned_merchant or payee or description,
                "education_expense_keyword",
                note=f"Matched education expense keyword: {education_hit}",
            )
        business_expense_hit = _match_keyword(combined_lower, BUSINESS_EXPENSE_KEYWORDS)
        if business_expense_hit or (
            (description or "").strip().lower() == "aws"
            and "amazon web services" in combined_lower
        ):
            return _business_result(
                session,
                cleaned_merchant or payee or description,
                "business_expense_keyword",
                note="Matched business software/infrastructure vendor",
            )
        if numeric_amount < 0 and account_type not in LIABILITY_ACCOUNT_TYPES:
            debt_payment_hit = _match_keyword(combined_lower, DEBT_PAYMENT_KEYWORDS)
    except (TypeError, ValueError):
        numeric_amount = 0.0
    if debt_payment_hit:
        return _debt_payment_result(
            session,
            cleaned_merchant or payee or description,
            "debt_payment_keyword",
            note=f"Matched debt payment keyword: {debt_payment_hit}",
        )

    mixed_positive_inflow = False
    try:
        mixed_positive_inflow = numeric_amount > 0 and any(
            term in combined_lower for term in MIXED_POSITIVE_INFLOW_KEYWORDS
        )
    except (TypeError, ValueError):
        mixed_positive_inflow = False

    if normalized and not ambiguous_transfer_like and not mixed_positive_inflow:
        profile = _find_profile(session, normalized, currency)
        if profile:
            category_name = _category_name(session, profile.default_category_id)
            if _can_apply_learned_category(
                category_name,
                amount,
                bool(internal_transfer_result),
                p2p_hit,
                person_like,
            ):
                return {
                    "category_id": profile.default_category_id,
                    "subcategory_id": profile.default_subcategory_id,
                    "subcategory_name": subcategory_name(session, profile.default_subcategory_id),
                    "category_name": category_name,
                    "classification": profile.default_classification,
                    "merchant_name": profile.name,
                    "source": "merchant_profile",
                }
    if cleaned_merchant and not ambiguous_transfer_like and not mixed_positive_inflow:
        normalized_cleaned = normalize_merchant(cleaned_merchant)
        if normalized_cleaned and normalized_cleaned != normalized:
            profile = _find_profile(session, normalized_cleaned, currency)
            if profile:
                category_name = _category_name(session, profile.default_category_id)
                if _can_apply_learned_category(
                    category_name,
                    amount,
                    bool(internal_transfer_result),
                    p2p_hit,
                    person_like,
                ):
                    return {
                        "category_id": profile.default_category_id,
                        "subcategory_id": profile.default_subcategory_id,
                        "subcategory_name": subcategory_name(session, profile.default_subcategory_id),
                        "category_name": category_name,
                        "classification": profile.default_classification,
                        "merchant_name": profile.name,
                        "source": "merchant_profile",
                    }

    if bank_category_name and not bank_transfer_hint:
        category_id = _ensure_category(session, bank_category_name)
        note_parts = []
        if bank_category:
            note_parts.append(f"bank_category={bank_category}")
        if pfc_primary or pfc_detailed:
            note_parts.append(f"pfc={pfc_primary or ''}/{pfc_detailed or ''}".strip("/"))
        note = " ".join(note_parts) if note_parts else None
        return {
            "category_id": category_id,
            "category_name": bank_category_name,
            "classification": "Personal",
            "merchant_name": cleaned_merchant or payee or description,
            "source": "bank_category",
            "note": note,
        }

    if mcc_category and not mcc_transfer_hint:
        category_id = _ensure_category(session, mcc_category)
        return {
            "category_id": category_id,
            "category_name": mcc_category,
            "classification": "Personal",
            "merchant_name": cleaned_merchant or payee or description,
            "source": "mcc",
            "note": f"MCC {mcc}",
        }

    staffing_hit = _match_keyword(combined_lower, STAFFING_KEYWORDS)
    if staffing_hit:
        return _staffing_result(
            session,
            cleaned_merchant or payee or description,
            "keyword",
            note=f"Matched staffing keyword: {staffing_hit}",
        )

    if amount is not None and amount > 0 and account_type not in LIABILITY_ACCOUNT_TYPES:
        income_hit = _match_keyword(combined_lower, INCOME_KEYWORDS)
        if income_hit:
            return _income_result(
                session,
                cleaned_merchant or payee or description,
                "income_keyword",
                note=f"Matched income keyword: {income_hit}",
            )

    memory_rows = [] if ambiguous_transfer_like or mixed_positive_inflow else _search_memory(session, combined)
    if memory_rows:
        category_counts = Counter(row["category_id"] for row in memory_rows if row["category_id"])
        top_category = category_counts.most_common(1)[0][0] if category_counts else None
        if top_category:
            top_category_name = _category_name(session, top_category)
            if not _can_apply_learned_category(
                top_category_name,
                amount,
                bool(internal_transfer_result),
                p2p_hit,
                person_like,
            ):
                top_category = None
        if top_category:
            return {
                "category_id": top_category,
                "category_name": _category_name(session, top_category),
                "classification": memory_rows[0]["classification"] or "Personal",
                "merchant_name": cleaned_merchant or payee or description,
                "source": "memory",
            }

    knowledge_rows = _search_knowledge(session, combined)

    _seed_default_categories(session)

    model = get_classification_model(session)
    can_use_model = bool(model and get_local_ai_enabled(session))
    if model and can_use_model:
        categories = session.execute(
            select(Category).where(Category.is_active == 1).order_by(Category.name)
        ).scalars().all()
        category_names = [c.name for c in categories]
        context = get_setting(session, "personal_context", "") or ""
        memory_examples = "\n".join(
            [
                f"- {row['merchant']}: {row['content']} -> {_category_name(session, row['category_id']) or 'Unknown'} ({row['classification'] or 'Personal'})"
                for row in memory_rows[:4]
            ]
        ) or "None"
        knowledge = "\n".join(
            [f"- {row['title']}: {row['content']}" for row in knowledge_rows]
        ) or "None"
        owned_accounts = ", ".join(
            account.name
            for account in session.execute(select(Account)).scalars().all()
            if account.name
        ) or "None"
        hint_lines = [
            f"- matched_owned_account_transfer: {internal_transfer_result['note'] if internal_transfer_result else 'none'}",
            f"- bank_transfer_hint: {bank_category_name if bank_transfer_hint else 'none'}",
            f"- mcc_transfer_hint: {mcc_category if mcc_transfer_hint else 'none'}",
            f"- bank_rail_hint: {rail_keyword_hit or 'none'}",
            f"- owned_account_mention: {account_mention or 'none'}",
            f"- social_p2p_hint: {p2p_hit or 'none'}",
            f"- person_like_counterparty: {'yes' if person_like else 'no'}",
        ]
        prompt = (
            "Classify the transaction into one category from the list.\n"
            "You are classifying the economic purpose, not merely the payment rail.\n"
            "Use category 'Transfers' only when evidence shows money moved between the user's own accounts.\n"
            "Do not classify as Transfers merely because the bank label, MCC, or description mentions transfer, Wise, wire, remit, PayID, BPAY, or FX.\n"
            "A payment sent over bank rails to a landlord, lender, utility, merchant, contractor, or vendor should be classified by purpose instead.\n"
            "Person-like names are not automatically Friends & Family; they can represent housing, payroll, contractors, loans, or other obligations.\n"
            "Positive inflows should not default to expense categories like Food, Lifestyle, Health, Debt, Savings, Transport, or Housing & Bills unless there is strong evidence of a refund or reversal.\n"
            "Positive inflows can represent wages, business income, family help, reimbursements, investment proceeds, or loan disbursements.\n"
            "Use 'Income' for wages, business inflows, dividends, distributions, fund payouts, or sale proceeds, not for savings transfers, round-ups, or contributions.\n"
            "Return JSON: {\"category\":\"<name>\",\"classification\":\"Personal|Business\",\"merchant_name\":\"<merchant>\",\"note\":\"<why>\"}\n"
            f"Categories: {category_names}\n"
            f"Owned accounts: {owned_accounts}\n"
            f"Personal context: {context}\n"
            f"Recent examples:\n{memory_examples}\n"
            f"Knowledge base:\n{knowledge}\n"
            f"Signals:\n" + "\n".join(hint_lines) + "\n"
            f"Transaction: payee={payee}, description={description}, notes={notes}, merchant_hint={cleaned_merchant}\n"
            f"Amount: {amount_label}\n"
            f"Bank category: {bank_category or pfc_primary or pfc_detailed or 'None'}\n"
            f"MCC: {mcc or 'None'}\n"
        )
        response = _local_ai_call(session, prompt)
        if response and response.get("category"):
            category_name = canonicalize_category_name(response.get("category"))
            category_id = _ensure_category(session, category_name)
            result = {
                "category_id": category_id,
                "category_name": category_name,
                "classification": response.get("classification", "Personal"),
                "merchant_name": response.get("merchant_name") or cleaned_merchant or payee or description,
                "source": "local_ai",
                "note": response.get("note"),
            }
            if category_name in {TRANSFER_CATEGORY_NAME, FRIENDS_CATEGORY_NAME} or ambiguous_transfer_like:
                result["skip_profile"] = True
                result["skip_memory"] = True
            return result

    if not can_use_model and p2p_hit and person_like:
        return _friend_result(
            session,
            cleaned_merchant or payee or description,
            "p2p_fallback",
            note=f"Matched social payment rail without stronger context: {p2p_hit}",
        )

    if not can_use_model and person_like:
        if amount is not None and amount < 0:
            return _friend_result(
                session,
                cleaned_merchant or payee or description,
                "person_name_fallback",
                note="Person-like payee fallback",
            )
        if amount is not None and amount > 0:
            result = _income_result(
                session,
                cleaned_merchant or payee or description,
                "person_name_income_fallback",
                note="Person-like payer fallback",
            )
            result["skip_profile"] = True
            result["skip_memory"] = True
            return result

    return {
        "category_id": None,
        "category_name": None,
        "classification": "Personal",
        "merchant_name": cleaned_merchant or payee or description,
        "source": "unknown",
    }


def apply_classification(session, transaction_id: int, result: dict) -> dict:
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise ValueError("Transaction not found")
    category_id = result.get("category_id")
    classification = result.get("classification") or "Personal"
    merchant_name = result.get("merchant_name") or txn.payee or txn.description
    category_name = result.get("category_name") or _category_name(session, category_id)
    subcategory_id = result.get("subcategory_id")
    force_profile = bool(result.get("force_profile"))
    skip_profile = bool(result.get("skip_profile"))
    skip_memory = bool(result.get("skip_memory"))
    learning_text = " ".join([merchant_name or "", txn.description or "", txn.payee or "", txn.notes or ""])
    if not force_profile and _should_skip_positive_learning(category_name, txn.amount, learning_text):
        skip_profile = True
        skip_memory = True
    if not force_profile and _should_skip_profile_learning(
        category_name,
        merchant_name,
        txn.description,
        txn.payee,
        txn.notes,
    ):
        skip_profile = True
        skip_memory = True

    if category_id:
        existing_split = session.execute(
            select(TransactionSplit).where(TransactionSplit.transaction_id == transaction_id)
        ).scalar_one_or_none()
        if not existing_split:
            split = TransactionSplit(
                transaction_id=transaction_id,
                category_id=category_id,
                subcategory_id=subcategory_id,
                amount=txn.amount,
                currency=txn.currency,
                classification=classification,
                notes="Auto-classified",
                business_percent=None,
            )
            session.add(split)
        else:
            existing_split.category_id = category_id
            existing_split.subcategory_id = subcategory_id
            existing_split.classification = classification

    txn.classification = classification
    if category_id and txn.reconciliation_state in ("pending", "imported"):
        txn.reconciliation_state = "verified"
    txn.updated_at = _now_str()

    if category_id and not skip_profile:
        normalized = normalize_merchant(merchant_name)
        if normalized:
            currency = normalize_currency(txn.currency)
            profile = _find_profile(session, normalized, currency)
            if not profile:
                profile = MerchantProfile(
                    name=merchant_name,
                    normalized_name=normalized,
                    currency=currency,
                    default_category_id=category_id,
                    default_subcategory_id=subcategory_id,
                    default_classification=classification,
                    notes=None,
                    created_at=_now_str(),
                    updated_at=_now_str(),
                )
                session.add(profile)
            else:
                if force_profile or profile.default_category_id is None:
                    profile.default_category_id = category_id
                if force_profile or profile.default_subcategory_id is None or profile.default_subcategory_id != subcategory_id:
                    profile.default_subcategory_id = subcategory_id
                profile.default_classification = classification
                profile.updated_at = _now_str()

    if category_id and not skip_memory:
        content = " | ".join([merchant_name, txn.description or "", txn.notes or ""]).strip()
        memory = TransactionMemory(
            transaction_id=transaction_id,
            merchant=merchant_name,
            content=content or merchant_name,
            category_id=category_id,
            classification=classification,
            created_at=_now_str(),
        )
        session.add(memory)
    audit = ClassificationAudit(
        transaction_id=transaction_id,
        source=result.get("source") or "unknown",
        category_id=category_id,
        classification=classification,
        merchant_name=merchant_name,
        note=result.get("note"),
        created_at=_now_str(),
    )
    session.add(audit)
    session.flush()
    if category_id and not skip_memory:
        try:
            session.execute(
                text("INSERT INTO transaction_memory_fts(rowid, merchant, content) VALUES (:id, :merchant, :content)"),
                {"id": memory.id, "merchant": merchant_name or "", "content": content or merchant_name},
            )
        except OperationalError:
            logger.warning("FTS memory insert failed", exc_info=True)
    return result


def classify_transaction_record(
    session,
    transaction_id: int,
    *,
    extra_payload: dict | None = None,
    force: bool = False,
) -> dict | None:
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise ValueError("Transaction not found")
    if is_legacy_opening_transaction(txn.description, txn.notes, txn.payee):
        return None
    if not force:
        existing_split = session.execute(
            select(TransactionSplit).where(TransactionSplit.transaction_id == transaction_id)
        ).scalar_one_or_none()
        if existing_split:
            return None
    payload = build_transaction_payload(session, txn)
    if extra_payload:
        for key, value in extra_payload.items():
            if value is not None:
                payload[key] = value
    result = classify_payload(session, payload)
    apply_classification(session, transaction_id, result)
    if result.get("category_id") and txn.reconciliation_state in ("pending", "imported"):
        txn.reconciliation_state = "verified"
    txn.updated_at = _now_str()
    return result


def sync_full_amount_split(
    session,
    transaction_id: int,
    previous_amount: float | int | None,
    new_amount: float | int | None,
    currency: str | None = None,
) -> bool:
    splits = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == transaction_id)
    ).scalars().all()
    if len(splits) != 1:
        return False
    split = splits[0]
    try:
        old_value = float(previous_amount or 0.0)
        split_value = float(split.amount or 0.0)
        next_value = float(new_amount or 0.0)
    except (TypeError, ValueError):
        return False
    if abs(split_value - old_value) >= 0.01:
        return False
    split.amount = next_value
    if currency:
        split.currency = currency
    return True


def _category_name(session, category_id: Optional[int]) -> Optional[str]:
    if not category_id:
        return None
    row = session.execute(select(Category).where(Category.id == category_id)).scalar_one_or_none()
    return row.name if row else None


register_classification_port(
    apply_classification_handler=apply_classification,
    classify_payload_handler=classify_payload,
    classify_transaction_record_handler=classify_transaction_record,
    sync_full_amount_split_handler=sync_full_amount_split,
    clean_merchant_handler=clean_merchant,
    normalize_merchant_handler=normalize_merchant,
)
