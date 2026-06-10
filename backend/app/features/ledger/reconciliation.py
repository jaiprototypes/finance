FINAL_RECONCILIATION_STATES = {"verified", "cleared"}


def feed_reconciliation_state(current_state: str | None, *, feed_pending: bool, has_split: bool) -> str:
    normalized = (current_state or "imported").strip().lower()
    if normalized in FINAL_RECONCILIATION_STATES:
        return normalized
    if has_split:
        return "verified"
    return "pending" if feed_pending else "imported"
