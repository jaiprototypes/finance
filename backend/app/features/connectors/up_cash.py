"""Keep Up's embedded cash movements separate from categorized purchases."""

from ...core.time import utc_now_iso


class UpCashMetadata:
    """Apply a complete provider snapshot without changing the purchase ledger."""

    @staticmethod
    def amount(value: dict | None) -> float:
        """Read signed currency amounts, including the provider's integer fallback."""
        value = value or {}
        if value.get("value") is not None:
            return float(value["value"])
        return float(value.get("valueInBaseUnits") or 0) / 100.0

    @classmethod
    def apply(cls, mapping, attributes: dict, relationships: dict | None = None, *, synced_at: str | None = None) -> None:
        """Replace source metadata so repeated imports never accumulate cash."""
        roundup = attributes.get("roundUp") or {}
        cashback = attributes.get("cashback") or {}
        transfer = ((relationships or {}).get("transferAccount") or {}).get("data") or {}
        # amount already includes boostPortion; adding it again would duplicate cash.
        mapping.round_up_amount = cls.amount(roundup.get("amount"))
        mapping.cashback_amount = cls.amount(cashback.get("amount"))
        mapping.transfer_account_id = transfer.get("id")
        mapping.settled_at = attributes.get("settledAt")
        mapping.status = attributes.get("status") or ""
        mapping.cash_metadata_synced_at = synced_at or utc_now_iso()

    @staticmethod
    def movement_amount(purchase_amount: float, mapping) -> float:
        """Return the account movement while leaving merchant spending unchanged."""
        return float(purchase_amount) + float(mapping.round_up_amount or 0) + float(mapping.cashback_amount or 0)
