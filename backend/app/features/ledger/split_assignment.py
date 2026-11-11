from .models import Transaction, TransactionSplit


class SplitAssignment:
    """Distinguish a full transaction reassignment from additional allocations."""

    def __init__(self, transaction: Transaction, splits: list[TransactionSplit]):
        self.transaction = transaction
        self.splits = splits

    def _is_full_native_amount(self, amount: float, currency: str) -> bool:
        """Compare native amounts without treating foreign allocations as replacements."""
        return (
            currency.strip().upper() == self.transaction.currency.strip().upper()
            and abs(amount - self.transaction.amount) < 0.005
        )

    def reusable_split(self, amount: float, currency: str) -> TransactionSplit | None:
        """Reuse a lone full split; preserve and reject conflicting allocations."""
        if not self.splits or not self._is_full_native_amount(amount, currency):
            return None
        if len(self.splits) == 1:
            split = self.splits[0]
            if self._is_full_native_amount(split.amount, split.currency):
                return split
        raise ValueError(
            "This transaction already has split allocations. Edit those allocations "
            "before assigning its full amount."
        )
