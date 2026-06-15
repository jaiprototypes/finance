LEGACY_OPENING_MARKERS = (
    "legacy opening balance",
    "legacy balance adjustment",
    "imported opening for legacy loan",
)


def is_legacy_opening(description: str | None, notes: str | None, payee: str | None) -> bool:
    haystack = " ".join([description or "", notes or "", payee or ""]).lower()
    return any(marker in haystack for marker in LEGACY_OPENING_MARKERS)

