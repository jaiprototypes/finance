"""Recover savings allocations when a deleted saver no longer supplies its bank leg."""

import math
import re
from collections import Counter, defaultdict


class SavingsFallbackActivity:
    """Use explicit Up transfers and embedded round-ups, never category guesses."""

    def __init__(self, accounts, providers, records):
        self.accounts = accounts
        self.transaction_ids = set()
        self.records = records
        self.names = defaultdict(set)
        for provider in providers:
            account = accounts.get(provider.account_id)
            if account and not provider.is_active and account.type.lower() == "savings":
                self.names[self._words(provider.name)].add(account.id)
        self.links = {provider.up_account_id: provider.account_id for provider in providers}
        self.legs = Counter()
        for transaction, source in records:
            account = accounts.get(transaction.account_id)
            other_id = self.links.get(source.transfer_account_id)
            other = accounts.get(other_id)
            if (not account or account.type.lower() != "savings" or not other
                    or other.type.lower() not in {"bank", "checking"}):
                continue
            if transaction.amount < 0:
                kind = account.id
            elif self._words(transaction.description) == "round up":
                kind = "roundup"
            else:
                continue
            self.legs[(other_id, kind, self._key(transaction, transaction.amount))] += 1

    @staticmethod
    def _words(value):
        """Normalize bank account names without relying on user-entered notes."""
        return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()

    @staticmethod
    def _key(transaction, amount):
        """Match native dated movements without merging currencies or directions."""
        return (transaction.date, transaction.currency, round(float(amount), 2))

    def allocations(self):
        """Yield missing virtual saver amounts with their original checking evidence."""
        for transaction, source in self.records:
            account = self.accounts.get(transaction.account_id)
            if (transaction.account_id not in self.links.values()
                    or not account or account.type.lower() not in {"bank", "checking"}
                    or source.account_id != account.id
                    or str(transaction.classification).lower() == "business"):
                continue
            withdrawal = self._withdrawal(transaction, source)
            if withdrawal is not None:
                yield transaction, source, account, withdrawal, "savings_withdrawals"
            roundup = -float(source.round_up_amount or 0)
            if math.isfinite(roundup) and roundup > 0 and not self._consume(transaction, roundup, "roundup"):
                yield transaction, source, account, roundup, "savings_roundups"

    def _consume(self, transaction, amount, kind):
        """Prefer each imported saver leg exactly once before creating a fallback."""
        key = (transaction.account_id, kind, self._key(transaction, amount))
        if not self.legs[key]:
            return False
        self.legs[key] -= 1
        return True

    def _withdrawal(self, transaction, source):
        """An exact unique archived saver name proves the source of an Up receipt."""
        match = re.fullmatch(r"transfer from (.+)", self._words(transaction.description))
        if not match or transaction.amount <= 0:
            return None
        candidates = self.names.get(match[1], set())
        if len(candidates) != 1:
            return None
        saver = self.accounts[next(iter(candidates))]
        if (saver.currency != transaction.currency or not math.isfinite(transaction.amount)
                or (source.transfer_account_id and self.links.get(source.transfer_account_id) != saver.id)):
            return None
        self.transaction_ids.add(transaction.id)
        if self._consume(transaction, -transaction.amount, saver.id):
            return None
        return -float(transaction.amount)
