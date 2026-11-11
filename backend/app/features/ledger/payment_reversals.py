"""Shared budget/report exclusion for confirmed failed-payment return pairs."""

import math
import re
from collections import Counter, defaultdict
from datetime import date, timedelta

from sqlalchemy import select

from ...core.bank_activity import BankFeeMatcher
from ...core.settings import get_setting
from .models import Transaction
from .payment_return_links import ConfirmedPaymentReturns


class FailedPaymentMatcher:
    """Pair explicit bank returns with one earlier debit in the same ledger."""

    _return_label = re.compile(
        r"\b(?:direct debit dishonou?r|direct debit returned(?: unpaid)?|"
        r"(?:ach|payment|debit)(?: payment| debit)? returned(?: unpaid)?|"
        r"returned (?:unpaid|payment|direct debit)|unpaid (?:payment|direct debit))\b",
        re.IGNORECASE,
    )
    # These are payment references, not new disbursements/refunds when reversed.
    _payment_reference = re.compile(r"\b(?:irs usataxpymt|sallie mae bank (?:autopay|slmloanpmt)|paypal (?:inst xfer|retry pymt))\b")
    # The user confirmed credits carrying these complete bank references are unpaid Uber attempts.
    _uber_payment_reference = re.compile(r"(?:ach )?uber australia p (?:purchase|retry pymt)")

    @classmethod
    def excluded_ids(cls, transactions, *, irs_previous_month: bool = False,
                     confirmed_pairs: list | None = None, issues: list | None = None) -> set[int]:
        """Cancel each unique prior debit once, preserving later retries and fees."""
        charges = defaultdict(list)
        rows = sorted(transactions, key=lambda row: (row.date, row.id))
        excluded, reserved = cls._confirmed_ids(rows, confirmed_pairs or [], issues)
        for txn in rows:
            if txn.id not in reserved and txn.amount < 0 and not cls._is_fee(txn):
                key = (txn.account_id, txn.currency, round(abs(txn.amount), 2))
                charges[key].append(txn)
        for txn in rows:
            if txn.id in reserved or cls._is_fee(txn):
                continue
            key = (txn.account_id, txn.currency, round(abs(txn.amount), 2))
            if txn.amount > 0 and cls._is_return(txn):
                available = [charge for charge in charges[key] if charge.id not in excluded]
                matches = cls._date_candidates(txn, available, irs_previous_month)
                matches = cls._matching_payee(txn, matches)
                if len(matches) == 1:
                    excluded.update((txn.id, matches[0].id))
                elif len(matches) > 1 and issues is not None:
                    issues.append({"transaction_id": txn.id, "reason": "ambiguous_payment_return",
                                   "candidate_transaction_ids": [charge.id for charge in matches]})
        return excluded

    @classmethod
    def _confirmed_ids(cls, rows, records, issues):
        """Reserve all reviewed claims before any heuristic can consume either side."""
        by_id = {row.id: row for row in rows}
        claimed = Counter(value for record in records if isinstance(record, dict)
            for value in (record.get("payment_id"), record.get("return_id"))
            if type(value) is int and value > 0)
        excluded = set()
        for record in records:
            identities = ConfirmedPaymentReturns.identities(record)
            error = "invalid_confirmed_payment_return"
            if identities:
                payment_id, return_id = identities
                error = ("conflicting_confirmed_payment_return" if any(claimed[value] > 1 for value in identities)
                         else cls.confirmation_error(by_id.get(payment_id), by_id.get(return_id)))
                if not error:
                    excluded.update(identities)
                    continue
            if issues is not None:
                issue = {"reason": "invalid_confirmed_payment_return", "detail": error}
                if isinstance(record, dict):
                    issue.update({target: value if type(value) is int and value > 0 else None
                        for target, value in (("transaction_id", record.get("return_id")),
                            ("payment_transaction_id", record.get("payment_id")))})
                issues.append(issue)
        return excluded, set(claimed)

    @classmethod
    def confirmation_error(cls, payment, returned) -> str | None:
        """Validate bank facts while allowing reviewed links to override inferred timing."""
        if payment is None or returned is None:
            return "missing_payment_return_transaction"
        if payment.id == returned.id:
            return "identical_payment_return_transaction"
        if payment.account_id != returned.account_id or payment.currency != returned.currency:
            return "payment_return_account_or_currency_mismatch"
        try:
            debit, credit = float(payment.amount), float(returned.amount)
            if not math.isfinite(debit) or not math.isfinite(credit) or not debit < 0 < credit:
                return "invalid_payment_return_amount"
            if round(-debit, 2) != round(credit, 2) or round(credit, 2) <= 0:
                return "payment_return_amount_mismatch"
            if date.fromisoformat(payment.date) > date.fromisoformat(returned.date):
                return "payment_after_return"
        except (TypeError, ValueError, OverflowError):
            return "invalid_payment_return_fields"
        if cls._is_fee(payment) or cls._is_fee(returned):
            return "payment_return_is_bank_fee"
        return None

    @classmethod
    def _date_candidates(cls, returned, charges, irs_previous_month):
        """Apply the user's IRS following-month rule before the normal short window."""
        returned_date = date.fromisoformat(returned.date)
        if irs_previous_month and "irs usataxpymt" in cls._normalize(returned.description or ""):
            previous = (returned_date.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
            prior = [charge for charge in charges if charge.date[:7] == previous
                     and "irs usataxpymt" in cls._normalize(charge.description or "")]
            if prior:
                return prior
        return [charge for charge in charges if 0 <= (returned_date - date.fromisoformat(charge.date)).days <= 7]

    @staticmethod
    def _normalize(value: str) -> str:
        """Compare bank reference identities despite ACH prefixes and punctuation."""
        return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())

    @classmethod
    def _is_return(cls, txn) -> bool:
        """Accept explicit returns or the user's confirmed bank payment references."""
        reference = cls._normalize(txn.description or "")
        return bool(cls._return_label.search(txn.description or "")
                    or cls._payment_reference.search(reference)
                    or cls._uber_payment_reference.fullmatch(reference))

    @staticmethod
    def _is_fee(txn) -> bool:
        """Keep both fee and charge labels outside failed-payment cancellation."""
        return (BankFeeMatcher.has_fee_word(txn.description, txn.payee)
                or BankFeeMatcher.matches(txn.description, txn.payee))

    @classmethod
    def _matching_payee(cls, returned, charges):
        """Use a supplied merchant identity to reject unrelated equal debits."""
        reference = cls._normalize(returned.description or "")
        if ("paypal" in reference and cls._payment_reference.search(reference)
                or cls._uber_payment_reference.fullmatch(reference)):
            # Generic payment-rail payees cannot link a retry return to a different purchase.
            reference = re.sub(r"^ach ", "", reference)
            return [charge for charge in charges if re.sub(r"^ach ", "",
                    cls._normalize(charge.description or "")) == reference]
        payee = (returned.payee or "").strip().lower()
        if not payee or cls._return_label.fullmatch(payee):
            payee = cls._return_label.sub("", returned.description or "").strip(" :.-").lower()
        if not payee:
            return charges
        identity = cls._normalize(payee)
        return [charge for charge in charges if identity in cls._normalize(
            " ".join([charge.payee or "", charge.description or ""]))]


def _load_movements(session):
    """Share the same ledger projection for cancellation and diagnostics."""
    return session.execute(select(
        Transaction.id, Transaction.account_id, Transaction.date,
        Transaction.amount, Transaction.currency, Transaction.description, Transaction.payee,
    )).all()


def load_reversed_payment_ids(session) -> set[int]:
    """Load ledger fields once for the shared failed-payment matcher."""
    return FailedPaymentMatcher.excluded_ids(
        _load_movements(session), confirmed_pairs=ConfirmedPaymentReturns.load(session),
        irs_previous_month=get_setting(session, "irs_return_timing") == "previous_month")


def payment_return_issues(session) -> list[dict]:
    """Expose ambiguous return links instead of silently choosing a payment."""
    issues = []
    FailedPaymentMatcher.excluded_ids(_load_movements(session), issues=issues,
        confirmed_pairs=ConfirmedPaymentReturns.load(session),
        irs_previous_month=get_setting(session, "irs_return_timing") == "previous_month")
    return issues
