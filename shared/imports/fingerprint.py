import hashlib


DEFAULT_FIELDS = [
    "date",
    "description",
    "amount",
    "currency",
    "account_id",
    "payee",
]


def _norm(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value).strip().lower()


def fingerprint(row: dict, fields: list[str] | None = None) -> str:
    use_fields = fields or DEFAULT_FIELDS
    parts = [_norm(row.get(f)) for f in use_fields]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

