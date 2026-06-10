from dataclasses import dataclass


@dataclass
class ConnectorResult:
    name: str
    transactions: list[dict]


class Connector:
    name = "base"

    def is_enabled(self) -> bool:
        return False

    def fetch_transactions(self) -> ConnectorResult:
        return ConnectorResult(name=self.name, transactions=[])


class StubConnector(Connector):
    name = "stub"

    def is_enabled(self) -> bool:
        return False

    def fetch_transactions(self) -> ConnectorResult:
        return ConnectorResult(name=self.name, transactions=[])


class PlaidConnector(Connector):
    name = "plaid"

    def is_enabled(self) -> bool:
        try:
            from .plaid_client import is_configured

            return is_configured()
        except Exception:
            return False


class UpConnector(Connector):
    name = "up"

    def is_enabled(self) -> bool:
        try:
            from .up_client import is_configured

            return is_configured()
        except Exception:
            return False

from .plaid_client import sync_transactions as sync_plaid_transactions
from .up_client import sync_transactions as sync_up_transactions

__all__ = [
    "Connector",
    "ConnectorResult",
    "PlaidConnector",
    "StubConnector",
    "UpConnector",
    "sync_plaid_transactions",
    "sync_up_transactions",
]
