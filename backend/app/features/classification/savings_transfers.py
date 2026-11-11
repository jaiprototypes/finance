"""Direction-aware details for the user's Up savings movements."""

import math
import re

from ..ledger.models import Account


class SavingsTransferRule:
    """Describe savings deposits and withdrawals while retaining internal-transfer treatment."""

    @staticmethod
    def name_for(session, payload: dict) -> str | None:
        """Use bank identity and account role, never free-form transaction notes."""
        identity = re.sub(r"[^a-z0-9]+", " ",
                          str(payload.get("payee") or payload.get("description") or "").lower()).strip()
        account = session.get(Account, payload.get("account_id")) if payload.get("account_id") else None
        saver = account is not None and str(account.type).lower() == "savings"
        try:
            amount = float(payload.get("amount") or 0)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(amount):
            return None
        if identity == "round up" and saver and amount > 0:
            return "Round-up Savings Deposits"
        if not re.fullmatch(
            r"(?:(?:quick save|auto) )?(?:transfer|cover) (?:to|from) "
            r"(?:spending|bonus credit card payment)", identity,
        ):
            return None
        if not account or str(account.type).lower() not in {"bank", "checking", "savings"} or amount == 0:
            return None
        deposit = amount > 0 if saver else amount < 0
        return "Savings Deposits" if deposit else "Savings Withdrawals"
