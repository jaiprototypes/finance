"""Read-only budget visibility for transfers into and out of owned savings."""

import re
from collections import defaultdict

from sqlalchemy import select

from ...core.ledger_filters import is_legacy_opening
from ..connectors.models import UpAccount, UpTransaction
from ..fx.currency import convert_amount
from ..ledger.account_roles import is_business_account
from ..ledger.models import Account, Transaction
from .savings_fallbacks import SavingsFallbackActivity


class BudgetSavingsActivity:
    """Project each savings bank leg once without recategorizing internal transfers."""

    cash_types = {"bank", "checking", "savings", "cash"}

    def __init__(self, session):
        self.session = session
        self.transaction_ids: set[int] = set()

    def rows(self, base_currency: str, fx_summary: dict, start_date=None, end_date=None) -> list[dict]:
        """Preserve saver dates and signs; purchase roundup metadata is never added again."""
        self.transaction_ids = set()
        accounts, provider_accounts = self._accounts()
        query = select(Transaction, UpTransaction).join(
            UpTransaction, UpTransaction.transaction_id == Transaction.id,
        )
        if start_date:
            query = query.where(Transaction.date >= start_date)
        if end_date:
            query = query.where(Transaction.date <= end_date)
        query = query.order_by(Transaction.date, Transaction.id)
        result = []
        seen = set()
        linked_account_ids = set(provider_accounts.values())
        records = list(self.session.execute(query))
        for transaction, source in records:
            account = accounts.get(transaction.account_id)
            other = accounts.get(provider_accounts.get(source.transfer_account_id))
            if transaction.account_id not in linked_account_ids:
                continue
            if not self._is_savings_transfer(transaction, source, account, other):
                continue
            self.transaction_ids.add(transaction.id)
            if account.type.lower() != "savings" or transaction.id in seen:
                continue
            seen.add(transaction.id)
            result.append(self._row(transaction, source, account, base_currency, fx_summary))
        providers = list(self.session.scalars(select(UpAccount)))
        fallbacks = SavingsFallbackActivity(accounts, providers, records)
        for transaction, source, account, amount, kind in fallbacks.allocations():
            if kind == "savings_withdrawals":
                self.transaction_ids.add(transaction.id)
            row = self._row(transaction, source, account, base_currency, fx_summary, native=amount)
            row.update(entry_id=f"savings:{kind}:{transaction.id}", allocation_kind=kind,
                       subcategory_key=kind, subcategory_name={
                           "savings_withdrawals": "Savings Withdrawals", "savings_roundups": "Round-ups",
                       }[kind], source_native_amount=float(transaction.amount))
            if kind == "savings_roundups":
                row["description"] = f"Round-up · {transaction.description}"
            result.append(row)
        self.transaction_ids.update(fallbacks.transaction_ids)
        return result

    def _accounts(self):
        """Retain archived provider ownership so closing a saver cannot erase allocations."""
        providers = list(self.session.scalars(select(UpAccount)))
        archived = {provider.account_id for provider in providers if not provider.is_active}
        accounts = {account.id: account for account in self.session.scalars(select(Account))
                    if (account.is_active or account.id in archived) and account.type.lower() in self.cash_types
                    and not is_business_account(account)}
        links = defaultdict(set)
        for provider in providers:
            if provider.account_id in accounts:
                links[provider.up_account_id].add(provider.account_id)
        return accounts, {remote: next(iter(ids)) for remote, ids in links.items() if len(ids) == 1}

    @staticmethod
    def _is_savings_transfer(transaction, source, account, other) -> bool:
        """Require a bank-owned checking/savings relationship, rather than labels or memos."""
        if not account or not other or account.id == other.id or not transaction.amount:
            return False
        if source.account_id != account.id:
            return False
        if (account.type.lower() == "savings") == (other.type.lower() == "savings"):
            return False
        if str(transaction.classification or "").lower() == "business":
            return False
        return not is_legacy_opening(transaction.description, transaction.notes, transaction.payee)

    @staticmethod
    def _row(transaction, source, account, base_currency, fx_summary, *, native=None) -> dict:
        """Deposits increase the savings allocation; withdrawals reduce it."""
        native = float(transaction.amount) if native is None else float(native)
        identity = re.sub(r"[^a-z0-9]+", " ",
                          str(transaction.payee or transaction.description or "").lower()).strip()
        kind, name = ("savings_withdrawals", "Savings Withdrawals") if native < 0 else (
            ("savings_roundups", "Round-ups") if identity == "round up" else
            ("savings_deposits", "Savings Deposits")
        )
        currency = transaction.currency or account.currency or base_currency
        return {
            "entry_id": f"savings:{transaction.id}", "split_id": None,
            "transaction_id": transaction.id, "account_name": account.name,
            "date": str(transaction.date), "month": str(transaction.date)[:7],
            "description": transaction.description, "payee": transaction.payee,
            "category_id": None, "category_name": "Savings", "subcategory_id": None,
            "subcategory_key": kind, "subcategory_name": name, "allocation_kind": kind,
            "read_only": True, "cash_neutral": True, "budget_sign": -1,
            "currency": base_currency, "native_currency": currency,
            "native_amount": native, "native_gross_amount": native, "native_cashback": 0.0,
            "amount": convert_amount(native, currency, base_currency, fx_summary.get("aud_per_usd")),
            "pending": str(source.status or "").upper() == "HELD",
        }
