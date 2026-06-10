from collections.abc import Callable
from importlib import import_module

ApplyClassification = Callable[[object, int, dict], dict]
ClassifyPayload = Callable[[object, dict], dict]
ClassifyTransactionRecord = Callable[..., dict | None]
SyncFullAmountSplit = Callable[..., bool]
TextNormalizer = Callable[[str], str]

_apply_classification: ApplyClassification | None = None
_classify_payload: ClassifyPayload | None = None
_classify_transaction_record: ClassifyTransactionRecord | None = None
_sync_full_amount_split: SyncFullAmountSplit | None = None
_clean_merchant: TextNormalizer | None = None
_normalize_merchant: TextNormalizer | None = None


def register_classification_port(
    *,
    apply_classification_handler: ApplyClassification,
    classify_payload_handler: ClassifyPayload,
    classify_transaction_record_handler: ClassifyTransactionRecord,
    sync_full_amount_split_handler: SyncFullAmountSplit,
    clean_merchant_handler: TextNormalizer,
    normalize_merchant_handler: TextNormalizer,
) -> None:
    global _apply_classification
    global _classify_payload
    global _classify_transaction_record
    global _sync_full_amount_split
    global _clean_merchant
    global _normalize_merchant
    _apply_classification = apply_classification_handler
    _classify_payload = classify_payload_handler
    _classify_transaction_record = classify_transaction_record_handler
    _sync_full_amount_split = sync_full_amount_split_handler
    _clean_merchant = clean_merchant_handler
    _normalize_merchant = normalize_merchant_handler


def _ensure_registered() -> None:
    if _apply_classification is None:
        import_module("backend.app.features.classification.service")
    if _apply_classification is None:
        raise RuntimeError("Classification feature is not registered")


def apply_classification(session, transaction_id: int, result: dict) -> dict:
    _ensure_registered()
    return _apply_classification(session, transaction_id, result)  # type: ignore[misc]


def classify_payload(session, payload: dict) -> dict:
    _ensure_registered()
    return _classify_payload(session, payload)  # type: ignore[misc]


def classify_transaction_record(session, transaction_id: int, **kwargs) -> dict | None:
    _ensure_registered()
    return _classify_transaction_record(session, transaction_id, **kwargs)  # type: ignore[misc]


def sync_full_amount_split(session, transaction_id: int, previous_amount, new_amount, currency: str | None = None) -> bool:
    _ensure_registered()
    return _sync_full_amount_split(session, transaction_id, previous_amount, new_amount, currency)  # type: ignore[misc]


def clean_merchant(value: str) -> str:
    _ensure_registered()
    return _clean_merchant(value)  # type: ignore[misc]


def normalize_merchant(value: str) -> str:
    _ensure_registered()
    return _normalize_merchant(value)  # type: ignore[misc]
