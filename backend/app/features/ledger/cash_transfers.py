"""Identify internal cash components without treating all transfers as internal."""

import re
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select, text

from ..fx.currency import get_aud_per_usd_for_date
from .account_roles import is_business_account
from .bank_activity import BankActivityPolicy
from .models import Account, Transaction


class CashTransferPolicy:
    """Exclude proven moves within the included cash scope, preserving outside funding."""

    cash_types = {"bank", "checking", "savings", "cash"}
    owned_details = {"between own accounts", "wise transfers", "bank transfers"}
    _bank_reference = re.compile(r"\b(?:tfr|transfer)\s+(?:to|from)\s+(?:ck|sv)\s+(\d+)\b", re.I)
    _loan = re.compile(r"\b(?:tfr|transfer)\s+(?:to|from)\s+(?:lc|line of credit)\b|\badvance transfer cc\b", re.I)
    _retail = re.compile(r"\b(?:debitcard|purchase|point of sale)\b", re.I)
    _rail = re.compile(r"\b(?:wise|transferwise|ofx|revolut)\b", re.I)

    def __init__(self, session, included_account_ids=None, *, transactions=None, up_rows=None):
        self.session = session
        accounts = session.scalars(select(Account)).all()
        eligible = {row.id: row for row in accounts if row.is_active
                    and row.type.lower() in self.cash_types and not is_business_account(row)}
        self.accounts = {key: value for key, value in eligible.items()
                         if included_account_ids is None or key in included_account_ids}
        self.transactions = transactions if transactions is not None else session.scalars(select(Transaction)).all()
        self.excluded = {}
        self.pairs = []
        self._rates = {}
        self._masks = self._account_masks()
        up = up_rows if up_rows is not None else self._up_metadata()
        self._provider_components(up)
        self._bank_references()
        self._reviewed_pairs()

    def excluded_amount(self, transaction_id: int, kind: str = "raw") -> float:
        """Return only the signed native component that is internal to this scope."""
        return self.excluded.get((transaction_id, kind), 0.0)

    def _up_metadata(self):
        return {row["transaction_id"]: row for row in self.session.execute(text("""
            SELECT u.*, a.account_id AS transfer_local_account_id FROM up_transaction u
            LEFT JOIN up_account a ON a.up_account_id = u.transfer_account_id
        """)).mappings()}

    def _account_masks(self):
        masks = defaultdict(set)
        for account_id, mask in self.session.execute(text("SELECT account_id, mask FROM plaid_account")):
            if mask:
                masks[str(mask)].add(account_id)
        return masks

    def _provider_components(self, up):
        """Up relationships prove both savings legs; roundup metadata stays separate from purchases."""
        roundup_sources = set()
        for txn in self.transactions:
            mapping = up.get(txn.id)
            if txn.account_id not in self.accounts or mapping is None:
                continue
            other_id = mapping.get("transfer_local_account_id")
            if other_id not in self.accounts or other_id == txn.account_id:
                continue
            self.excluded[txn.id, "raw"] = float(txn.amount)
            if (self.accounts[txn.account_id].type.lower() == "savings"
                    and self._words(txn.payee or txn.description) == "round up"):
                roundup_sources.add(other_id)
        for txn in self.transactions:
            if txn.account_id in roundup_sources and txn.id in up:
                self.excluded[txn.id, "round_up"] = float(up[txn.id].get("round_up_amount") or 0)

    def _reference_account(self, txn):
        match = self._bank_reference.search(txn.description or "")
        targets = self._masks.get(match.group(1)[-4:], set()) if match else set()
        return next(iter(targets)) if len(targets) == 1 else None

    def _bank_references(self):
        """An exact imported checking reference proves ownership without requiring coincident amounts."""
        for txn in self.transactions:
            other = self._reference_account(txn)
            if (txn.account_id in self.accounts and other in self.accounts and other != txn.account_id
                    and not self._retail.search(txn.description or "")
                    and self.accounts[other].currency == txn.currency):
                self.excluded[txn.id, "raw"] = float(txn.amount)

    def _reviewed_pairs(self):
        """Require bilateral bank evidence and a unique opposite record before suppressing raw legs."""
        labels = defaultdict(list)
        for txn_id, category, detail, amount in self.session.execute(text("""
            SELECT s.transaction_id, c.name, d.name, s.amount FROM transaction_split s
            LEFT JOIN category c ON c.id = s.category_id
            LEFT JOIN subcategory d ON d.id = s.subcategory_id
        """)):
            labels[txn_id].append((category, detail, float(amount)))
        owner_names = self._owner_names()
        pending = BankActivityPolicy(self.session).pending_ids
        candidates = [txn for txn in self.transactions if self._candidate(txn, labels, owner_names)]
        incoming = defaultdict(list)
        for txn in candidates:
            if txn.amount > 0:
                incoming[str(txn.date)[:10]].append(txn)
        edges, reverse = defaultdict(list), defaultdict(list)
        for out in candidates:
            if out.amount >= 0:
                continue
            day = date.fromisoformat(str(out.date)[:10])
            for offset in range(-3, 4):
                for into in incoming[(day + timedelta(days=offset)).isoformat()]:
                    if self._pair_matches(out, into, pending, owner_names):
                        edges[out.id].append(into)
                        reverse[into.id].append(out)
        for out_id, matches in edges.items():
            if len(matches) == 1 and len(reverse[matches[0].id]) == 1:
                into = matches[0]
                out = reverse[into.id][0]
                self.excluded[out.id, "raw"] = float(out.amount)
                self.excluded[into.id, "raw"] = float(into.amount)
                self.pairs.append((out.id, into.id))

    def _candidate(self, txn, labels, owner_names):
        if txn.account_id not in self.accounts or (txn.id, "raw") in self.excluded or not txn.amount:
            return False
        identity = " ".join([txn.payee or "", txn.description or ""])
        if self._retail.search(identity) or self._loan.search(identity):
            return False
        if self._bank_reference.search(identity) and self._reference_account(txn) not in self.accounts:
            return False
        entries = labels.get(txn.id, [])
        if (len(entries) != 1 or entries[0][0] != "Transfers"
                or self._words(entries[0][1]) not in self.owned_details
                or abs(entries[0][2] - txn.amount) > .005):
            return False
        owned = self._owned_identity(txn, owner_names)
        if self._words(entries[0][1]) == "bank transfers" and not owned:
            return False
        return bool(owned or self._rail.search(identity))

    def _owned_identity(self, txn, owner_names):
        words = self._words(" ".join([txn.payee or "", txn.description or ""]))
        return any(re.search(rf"(?:^| ){re.escape(name)}(?: |$)", words) for name in owner_names)

    def _owner_names(self):
        """Use explicit reviewed merchant identities, never free-form transfer memos."""
        rows = self.session.execute(text("""
            SELECT r.value FROM rule r JOIN category c ON c.id = r.category_id
            WHERE r.is_active = 1 AND c.name = 'Transfers' AND r.operator = 'equals'
            AND r.field IN ('payee', 'description')
        """))
        generic = {"bank", "account", "checking", "savings", "transfer", "credit", "card",
                   "round", "up", "inc", "pty", "ltd", "corp", "company", "llc"}
        return {self._words(value) for value, in rows
                if 2 <= len(self._words(value).split()) <= 4 and not self._rail.search(value or "")
                and not generic.intersection(self._words(value).split())
                and all(word.isalpha() for word in self._words(value).split())}

    def _pair_matches(self, out, into, pending, owner_names):
        if out.account_id == into.account_id or (out.id in pending) != (into.id in pending):
            return False
        out_owned, into_owned = self._owned_identity(out, owner_names), self._owned_identity(into, owner_names)
        # Two generic payment rails are not evidence that either record names the owner.
        if not (out_owned or into_owned):
            return False
        if out.currency == into.currency:
            return abs(out.amount + into.amount) < .005
        if {out.currency, into.currency} != {"AUD", "USD"}:
            return False
        identity = " ".join([out.description or "", out.payee or "", into.description or "", into.payee or ""])
        if not self._rail.search(identity) and not (out_owned and into_owned):
            return False
        day = str(out.date)[:10]
        if day not in self._rates:
            try:
                self._rates[day] = get_aud_per_usd_for_date(self.session, day)["aud_per_usd"]
            except ValueError:
                self._rates[day] = None
        rate = self._rates[day]
        if not rate:
            return False
        expected = -out.amount * rate if out.currency == "USD" else -out.amount / rate
        return abs(into.amount - expected) <= max(.02, expected * .08)

    @staticmethod
    def _words(value):
        """Ignore punctuation and middle initials while retaining full identity words."""
        return " ".join(word for word in re.sub(r"[^a-z0-9]+", " ", value or "", flags=re.I).lower().split()
                        if len(word) > 1)
