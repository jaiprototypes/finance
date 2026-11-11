"""Reconstruct account cash from dated provider balances and native movements."""

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import select, text

from ..fx.currency import convert_amount
from .account_roles import is_business_account
from .models import Account, Transaction
from .cash_transfers import CashTransferPolicy


CASH_ACCOUNT_TYPES = {"bank", "checking", "savings", "cash"}


@dataclass(frozen=True)
class _CashMovement:
    """Retain purchase amounts and provider adjustments independently."""

    day: str
    transaction_id: int
    raw_amount: float
    amount: float
    pending: bool = False
    round_up: float = 0.0
    cashback: float = 0.0


@dataclass
class _CashAccount:
    """Keep one account's anchor, feed coverage, and movement history together."""

    account: Account
    anchor: dict | None
    movements: list[_CashMovement]
    coverage_start: str | None
    coverage_status: str


class LedgerCashflowService:
    """Keep cash conservation independent of budget classifications and plans."""

    def __init__(self, session, *, base_currency: str, aud_per_usd: float):
        self.session = session
        self.base_currency = base_currency
        self.aud_per_usd = aud_per_usd

    def report(self, months: list[str]) -> dict[str, Any]:
        """Use one reference rate for anchors and movements so totals conserve cash."""
        accounts = self._load_accounts()
        anchors = [item.anchor for item in accounts if item.anchor]
        complete = bool(accounts) and len(anchors) == len(accounts)
        starts = [item.coverage_start for item in accounts if item.coverage_start]
        savers = [item for item in accounts if item.account.type.lower() == "savings"]
        savings_balance = self._savings_balance(savers)
        return {
            "savings_balance": savings_balance,
            "base_currency": self.base_currency,
            "basis": "provider_available_cash",
            "fx": {"aud_per_usd": self.aud_per_usd, "method": "shared_reference_rate"},
            "cash_balance": sum(self._convert(item.anchor["balance"], item.account.currency)
                                for item in accounts) if complete else None,
            "as_of": min((anchor["as_of"] for anchor in anchors), default=None),
            "latest_as_of": max((anchor["as_of"] for anchor in anchors), default=None),
            "coverage_start": max(starts) if accounts and len(starts) == len(accounts) else None,
            "accounts": [self._account_summary(item) for item in accounts],
            "months": {month: self._month(month, accounts) for month in months},
        }

    def _savings_balance(self, accounts: list[_CashAccount]) -> float | None:
        """Total current connected saver balances without summing monthly allocations."""
        if any(item.anchor is None for item in accounts):
            return None
        return sum(self._convert(item.anchor["balance"], item.account.currency) for item in accounts)

    def _load_accounts(self) -> list[_CashAccount]:
        """Include active personal cash accounts, including savings and cash wallets."""
        anchors = self._anchors()
        transactions: dict[int, list[Transaction]] = {}
        for txn in self.session.execute(select(Transaction).order_by(Transaction.date, Transaction.id)).scalars():
            transactions.setdefault(txn.account_id, []).append(txn)
        up = {row["transaction_id"]: row for row in self.session.execute(text(
            "SELECT u.*, a.account_id AS transfer_local_account_id FROM up_transaction u "
            "LEFT JOIN up_account a ON a.up_account_id = u.transfer_account_id"
        )).mappings()}
        plaid = {row["transaction_id"]: row for row in self.session.execute(text(
            "SELECT transaction_id, pending FROM plaid_transaction"
        )).mappings()}
        results = []
        for account in self.session.execute(select(Account).order_by(Account.id)).scalars():
            if not account.is_active or account.type.lower() not in CASH_ACCOUNT_TYPES or is_business_account(account):
                continue
            rows = transactions.get(account.id, [])
            anchor = anchors.get(account.id)
            if not rows and not anchor and account.type.lower() != "savings":
                continue
            results.append(self._account(account, rows, anchor, up, plaid))
        self.transfers = CashTransferPolicy(self.session, {item.account.id for item in results},
            transactions=[txn for rows in transactions.values() for txn in rows], up_rows=up)
        return results

    def _anchors(self) -> dict[int, dict]:
        """Prefer available balances, while retaining current balances and their dates."""
        result: dict[int, dict] = {}
        for table, source in (("up_account", "up"), ("plaid_account", "plaid")):
            rows = self.session.execute(text(
                f"SELECT account_id, available_balance, current_balance, balance_as_of, is_active FROM {table}"
            )).mappings()
            for row in rows:
                balance = row["available_balance"] if row["available_balance"] is not None else row["current_balance"]
                if not row["account_id"] or not row["is_active"] or balance is None or not row["balance_as_of"]:
                    continue
                anchor = {
                    "balance": float(balance), "available_balance": row["available_balance"],
                    "current_balance": row["current_balance"], "as_of": str(row["balance_as_of"]),
                    "balance_basis": "available" if row["available_balance"] is not None else "current",
                    "source": source,
                }
                existing = result.get(row["account_id"])
                if existing is None or anchor["as_of"] > existing["as_of"]:
                    result[row["account_id"]] = anchor
        return result

    def _account(self, account, rows, anchor, up, plaid) -> _CashAccount:
        """A partial manual import cannot extend a continuous provider feed backward."""
        movements = [self._movement(txn, up.get(txn.id), plaid.get(txn.id)) for txn in rows]
        source = anchor["source"] if anchor else None
        mapped = [txn for txn in rows if (txn.id in up if source == "up" else txn.id in plaid)]
        coverage_start = min((str(txn.date)[:10] for txn in mapped), default=None)
        status = "anchored_reconstruction"
        if anchor is None:
            status = "missing_anchor"
        elif coverage_start is None:
            status = "missing_feed_coverage"
        elif source == "up" and any(not up[txn.id]["cash_metadata_synced_at"] for txn in mapped):
            status = "missing_cash_metadata"
        elif any(str(txn.currency).upper() != str(account.currency).upper() for txn in rows):
            status = "currency_mismatch"
        elif any(move.day > anchor["as_of"][:10] for move in movements):
            status = "anchor_stale"
        if status != "anchored_reconstruction":
            coverage_start = None
        return _CashAccount(account, anchor, movements, coverage_start, status)

    @staticmethod
    def _movement(txn, up, plaid) -> _CashMovement:
        """Cash includes Up reservations, roundups, and cashback at their original dates."""
        raw = float(txn.amount or 0)
        return _CashMovement(
            day=str(txn.date)[:10], transaction_id=txn.id, raw_amount=raw,
            amount=raw + float(up["round_up_amount"] or 0) + float(up["cashback_amount"] or 0) if up else raw,
            pending=(str(up["status"] or "").upper() == "HELD") if up else bool(plaid and plaid["pending"]),
            round_up=float(up["round_up_amount"] or 0) if up else 0.0,
            cashback=float(up["cashback_amount"] or 0) if up else 0.0,
        )

    @staticmethod
    def _account_summary(item: _CashAccount) -> dict:
        """Expose native diagnostics without treating incomplete ledger net as a bank balance."""
        anchor = item.anchor or {}
        return {
            "account_id": item.account.id, "name": item.account.name, "currency": item.account.currency,
            "balance_source": anchor.get("source"), "balance_basis": anchor.get("balance_basis"),
            "anchor_balance": anchor.get("balance"), "available_balance": anchor.get("available_balance"),
            "current_balance": anchor.get("current_balance"), "as_of": anchor.get("as_of"),
            "coverage_start": item.coverage_start, "coverage_status": item.coverage_status,
            "history_start": min((move.day for move in item.movements), default=None),
            "ledger_net": sum(move.raw_amount for move in item.movements),
            "source_adjustments": {
                "round_up": sum(move.round_up for move in item.movements),
                "cashback": sum(move.cashback for move in item.movements),
            },
            "pending_net": sum(move.amount for move in item.movements if move.pending),
        }

    def _month(self, month: str, accounts: list[_CashAccount]) -> dict:
        """Aggregate native account bridges only when every included account is covered."""
        start, end = self._month_bounds(month)
        currencies: dict[str, dict] = {}
        as_of = []
        savings_closing = 0.0
        for item in accounts:
            values = self._native_month(item, start, end)
            if item.account.type.lower() == "savings":
                closing = values["closing"]
                savings_closing = (None if closing is None or savings_closing is None else
                                   savings_closing + self._convert(closing, item.account.currency))
            totals = currencies.setdefault(item.account.currency, self._empty_totals())
            self._add_totals(totals, values)
            if item.anchor:
                as_of.append(item.anchor["as_of"])
        aggregate = self._empty_totals()
        for currency, values in currencies.items():
            self._add_totals(aggregate, {
                key: self._convert(value, currency) if value is not None else None
                for key, value in values.items()
            })
        if not accounts:
            aggregate["opening"] = aggregate["closing"] = None
        return {
            **aggregate, "by_currency": currencies, "savings_closing": savings_closing,
            "coverage_status": "anchored_reconstruction" if aggregate["closing"] is not None else "unavailable",
            "as_of": min(as_of, default=None),
            "latest_as_of": max(as_of, default=None),
        }

    def _native_month(self, item: _CashAccount, start: str, end: str) -> dict:
        """Backcast from a dated anchor; later months carry the last known snapshot."""
        period = [move for move in item.movements if start <= move.day < end]
        external = [value - self.transfers.excluded_amount(move.transaction_id, kind)
                    for move in period for kind, value in
                    (("raw", move.raw_amount), ("round_up", move.round_up), ("cashback", move.cashback))]
        values = {
            "opening": None, "closing": None,
            "received": sum(value for value in external if value > 0),
            "paid": -sum(value for value in external if value < 0),
            "transfer_adjustment": sum(move.amount for move in period) - sum(external),
            "pending": sum(move.amount for move in period if move.pending),
        }
        if not item.coverage_start or start < item.coverage_start or not item.anchor:
            return values
        anchor_day = item.anchor["as_of"][:10]
        after_start = sum(move.amount for move in item.movements if start <= move.day <= anchor_day)
        opening = item.anchor["balance"] - after_start if start <= anchor_day else item.anchor["balance"]
        values["opening"] = opening
        values["closing"] = opening + values["received"] - values["paid"] + values["transfer_adjustment"]
        return values

    @staticmethod
    def _month_bounds(month: str) -> tuple[str, str]:
        """Use an exclusive month end so transaction dates need no timezone coercion."""
        start = date.fromisoformat(f"{month}-01")
        end = date(start.year + 1, 1, 1) if start.month == 12 else date(start.year, start.month + 1, 1)
        return start.isoformat(), end.isoformat()

    @staticmethod
    def _empty_totals() -> dict[str, float | None]:
        """Missing account coverage propagates instead of becoming an invented zero balance."""
        return {"opening": 0.0, "received": 0.0, "paid": 0.0, "closing": 0.0, "pending": 0.0,
                "transfer_adjustment": 0.0}

    @staticmethod
    def _add_totals(total: dict, values: dict) -> None:
        """Retain unknown opening and closing balances across account and currency sums."""
        for key, value in values.items():
            total[key] = None if value is None or total[key] is None else total[key] + value

    def _convert(self, amount: float, currency: str) -> float:
        """Apply the caller's shared reference rate rather than fetching or changing rates."""
        return convert_amount(amount, currency, self.base_currency, self.aud_per_usd)
