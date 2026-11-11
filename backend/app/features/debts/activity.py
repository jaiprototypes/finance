"""Track liabilities from checking without duplicating their bank movements."""

import math
import re
from datetime import date

from sqlalchemy import or_, select, text

from ...core.bank_activity import BankFeeMatcher
from ..ledger.bank_activity import BankActivityPolicy
from ..ledger.models import Account, Transaction
from ..ledger.payment_reversals import load_reversed_payment_ids
from .models import DebtProfile


class DebtActivityMatcher:
    """Use an exact loan account reference or an anchored lender bank identity."""

    _line = re.compile(r"\b(?:lc|line\s+of\s+credit)\s*[:#-]?\s*(\d+)\b", re.I)
    _sallie = re.compile(r"^(?:ach\s*:\s*)?sallie\s*mae(?:\s+bank)?\b", re.I)

    @classmethod
    def matches(cls, reference: str, transaction) -> bool:
        """Do not mistake the owner's ACH memo for money paid to the lender."""
        description = str(transaction.description or "").strip()
        if reference.isdigit():
            return any(match.group(1) == reference for match in cls._line.finditer(description))
        normalized = re.sub(r"[^a-z0-9]", "", reference.lower())
        if normalized == "salliemae":
            return bool(cls._sallie.search(description))
        return bool(normalized) and normalized == re.sub(
            r"[^a-z0-9]", "", str(transaction.payee or description).lower(),
        )


class DebtActivityService:
    """Keep source movements, observed balances, and interest estimates distinct."""

    def __init__(self, session, as_of: date | None = None):
        self.session = session
        self.as_of = as_of or date.today()

    def report(self) -> list[dict]:
        """Read all tracked profiles and their checking records in bounded queries."""
        profiles = self.session.scalars(select(DebtProfile).where(or_(
            DebtProfile.tracking_account_id.is_not(None), DebtProfile.balance_anchor_amount.is_not(None),
        ))).all()
        if not profiles:
            return []
        account_ids = {row.tracking_account_id for row in profiles if row.tracking_account_id}
        transactions = self.session.scalars(select(Transaction).where(
            Transaction.account_id.in_(account_ids), Transaction.date <= self.as_of.isoformat(),
        ).order_by(Transaction.date, Transaction.id)).all() if account_ids else []
        bank_activity = BankActivityPolicy(self.session)
        reversed_ids = load_reversed_payment_ids(self.session)
        accounts = {row.id: row for row in self.session.scalars(select(Account)).all()}
        coverage = self._coverage()
        return [self._profile(row, accounts, transactions, bank_activity.pending_ids, reversed_ids, coverage) for row in profiles]

    def _profile(self, profile, accounts, transactions, pending_ids, reversed_ids, coverage) -> dict:
        """A limit is never an observed balance, even when a full-limit draw is useful evidence."""
        account = accounts.get(profile.account_id)
        currency = account.currency if account else None
        matching = [row for row in transactions if row.account_id == profile.tracking_account_id
                    and row.currency == currency
                    and DebtActivityMatcher.matches(profile.tracking_reference or "", row)
                    and not BankFeeMatcher.has_fee_word(row.description, row.payee)]
        returned = reversed_ids | self._returned_advances(matching, pending_ids)
        activity = [self._movement(row, pending_ids, returned) for row in matching]
        posted = [row for row in activity if row["status"] == "posted"]
        source_coverage = coverage.get(profile.tracking_account_id)
        estimate = self._estimate(profile, posted, source_coverage)
        anchor_date = profile.balance_anchor_date
        balance = profile.balance_anchor_amount if anchor_date == self.as_of.isoformat() else None
        return {
            "profile_id": profile.id, "account_id": profile.account_id,
            "name": account.name if account else None, "currency": currency, "apr": profile.apr,
            "compounding": profile.compounding, "credit_limit": profile.credit_limit,
            "tracking_account_id": profile.tracking_account_id, "tracking_reference": profile.tracking_reference,
            "as_of": self.as_of.isoformat(), "balance": balance,
            "balance_source": "confirmed_balance" if balance is not None else "checking_derived_estimate",
            "balance_anchor_amount": profile.balance_anchor_amount, "balance_anchor_date": anchor_date,
            "history_start": activity[0]["date"] if activity else None,
            "history_end": activity[-1]["date"] if activity else None,
            "source_coverage_start": source_coverage,
            "draw_total": sum(row["amount"] for row in posted if row["amount"] > 0),
            "payment_total": sum(-row["amount"] for row in posted if row["amount"] < 0),
            "pending_draw_total": sum(row["amount"] for row in activity if row["status"] == "pending" and row["amount"] > 0),
            "pending_payment_total": sum(-row["amount"] for row in activity if row["status"] == "pending" and row["amount"] < 0),
            "activity": activity, **estimate,
        }

    def _coverage(self) -> dict:
        """Provider-backed history starts independently of older partial manual deposits."""
        rows = self.session.execute(text("""
            SELECT account_id, MIN(day) FROM (
                SELECT t.account_id, t.date AS day FROM transactions t
                JOIN plaid_transaction p ON p.transaction_id = t.id
                UNION ALL
                SELECT t.account_id, t.date AS day FROM transactions t
                JOIN up_transaction u ON u.transaction_id = t.id
            ) GROUP BY account_id
        """)).all()
        return dict(rows)

    @staticmethod
    def _returned_advances(matching, pending_ids) -> set[int]:
        """An explicit reversal of an advance cannot become a fresh full-limit anchor."""
        returned = set()
        for reversal in matching:
            if reversal.amount >= 0 or reversal.id in pending_ids or not re.search(
                r"\b(?:return(?:ed)?|reversal|reversed|unpaid|dishonou?r)\b", reversal.description, re.I,
            ):
                continue
            candidates = [row for row in matching if row.amount > 0 and row.id not in pending_ids
                          and row.id not in returned and abs(row.amount + reversal.amount) < 0.005
                          and 0 <= (date.fromisoformat(reversal.date) - date.fromisoformat(row.date)).days <= 7]
            if len(candidates) == 1:
                returned.update((reversal.id, candidates[0].id))
        return returned

    @staticmethod
    def _movement(transaction, pending_ids, reversed_ids) -> dict:
        """Failed payments and holds do not change committed loan activity."""
        status = "pending" if transaction.id in pending_ids else "returned" if transaction.id in reversed_ids else "posted"
        return {"transaction_id": transaction.id, "date": transaction.date,
                "description": transaction.description, "amount": float(transaction.amount),
                "direction": "draw" if transaction.amount > 0 else "payment", "status": status}

    def _estimate(self, profile, posted, source_coverage) -> dict:
        """Advance only from a dated observation or an explicitly labelled full-draw assumption."""
        start = profile.balance_anchor_date
        opening = profile.balance_anchor_amount
        basis = "confirmed_balance_anchor" if start and start <= self.as_of.isoformat() else None
        movements = [row for row in posted if start and row["date"] > start] if basis else []
        if basis is None:
            full_draws = [row for row in posted if profile.credit_limit and row["amount"] > 0
                          and abs(row["amount"] - profile.credit_limit) < 0.005]
            if full_draws:
                latest = full_draws[-1]
                start, opening, basis = latest["date"], latest["amount"], "full_limit_draw_assumption"
                movements = posted[posted.index(latest) + 1:]
        if basis is None:
            return self._empty_estimate("missing_balance_anchor")
        if source_coverage and source_coverage > start and start != self.as_of.isoformat():
            return self._empty_estimate("history_after_anchor_incomplete")
        result = self._advance(float(opening), start, movements, float(profile.apr), profile.compounding)
        if result is None:
            return self._empty_estimate("activity_exceeds_known_balance")
        net_balance, interest = result
        return {"estimated_balance": net_balance, "estimated_interest": interest,
                "projected_balance": net_balance + interest, "estimate_start": start,
                "estimate_basis": basis, "coverage": "confirmed" if start == self.as_of.isoformat() and basis == "confirmed_balance_anchor" else "estimated",
                "interest_method": {"daily": "daily_compounding_365_estimate", "monthly": "monthly_compounding_365_estimate"}.get(profile.compounding, "simple_daily_365_estimate"),
                "estimate_note": "Checking-derived estimate; loan-side fees, interest postings and payment allocation are unavailable. Full-limit draws do not verify a statement balance."}

    def _advance(self, opening, start, movements, apr, compounding):
        """Estimate interest between cash movements without posting it into the ledger."""
        balance, interest, previous = opening, 0.0, date.fromisoformat(start)
        for row in movements + [{"date": self.as_of.isoformat(), "amount": 0.0}]:
            current = date.fromisoformat(row["date"])
            days = max((current - previous).days, 0)
            daily_rate = apr / 365
            if compounding == "daily":
                interest += max(balance + interest, 0) * math.expm1(days * math.log1p(daily_rate))
            elif compounding == "monthly":
                interest += max(balance + interest, 0) * math.expm1(days * 12 / 365 * math.log1p(apr / 12))
            else:
                interest += max(balance, 0) * daily_rate * days
            balance += row["amount"]
            if balance < -0.005:
                return None
            previous = current
        return max(balance, 0), interest

    @staticmethod
    def _empty_estimate(coverage):
        """Missing history stays unknown instead of being coerced to zero debt."""
        return {"estimated_balance": None, "estimated_interest": None, "projected_balance": None,
                "estimate_start": None, "estimate_basis": None, "coverage": coverage,
                "interest_method": None, "estimate_note": "A real dated loan balance or a qualifying full-limit draw is needed; recorded cash movements alone do not establish an opening balance."}
