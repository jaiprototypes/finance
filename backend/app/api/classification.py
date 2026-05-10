from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import (
    Transaction,
    MerchantProfile,
    TransactionSplit,
    ClassificationAudit,
)
from ..schemas import (
    TransactionClassifyRequest,
    ClassificationResult,
    BulkClassifyRequest,
    MerchantProfileCreate,
    MerchantProfileOut,
    MerchantProfileUpdate,
)
from ..services.classification import (
    classify_payload,
    apply_classification,
    build_transaction_payload,
    classify_transaction_record,
    is_legacy_opening_transaction,
    normalize_currency,
    normalize_merchant,
    clean_merchant,
)
from ..services.subcategories import validate_subcategory_for_category

router = APIRouter(prefix="/classify", tags=["classification"])


@router.post("/preview", response_model=ClassificationResult)
def preview_classification(payload: TransactionClassifyRequest, session: Session = Depends(get_session)):
    result = classify_payload(session, payload.model_dump())
    return result


def _apply_profile_to_transactions(
    session: Session,
    profile: MerchantProfile,
    category_id: int,
    classification: str,
    subcategory_id: int | None = None,
) -> int:
    normalized_profile = profile.normalized_name or normalize_merchant(profile.name)
    if not normalized_profile:
        return 0
    profile_currency = normalize_currency(profile.currency)
    if not profile_currency:
        return 0
    txns = session.execute(select(Transaction)).scalars().all()
    splits = session.execute(select(TransactionSplit)).scalars().all()
    split_map: dict[int, list[TransactionSplit]] = {}
    for split in splits:
        split_map.setdefault(split.transaction_id, []).append(split)
    updated = 0
    for txn in txns:
        txn_currency = normalize_currency(txn.currency)
        if profile_currency and txn_currency != profile_currency:
            continue
        raw = txn.payee or txn.description or ""
        cleaned = clean_merchant(raw)
        normalized = normalize_merchant(cleaned or raw)
        if normalized != normalized_profile:
            continue
        txn_splits = split_map.get(txn.id, [])
        if txn_splits:
            total = sum(s.amount for s in txn_splits)
            if len(txn_splits) != 1 or abs(total - txn.amount) >= 0.01:
                continue
            split = txn_splits[0]
            split.category_id = category_id
            split.subcategory_id = subcategory_id
            split.classification = classification
            split.notes = "Merchant profile update"
        else:
            split = TransactionSplit(
                transaction_id=txn.id,
                category_id=category_id,
                subcategory_id=subcategory_id,
                amount=txn.amount,
                currency=txn.currency,
                classification=classification,
                notes="Merchant profile update",
                business_percent=None,
            )
            session.add(split)
            split_map.setdefault(txn.id, []).append(split)
        txn.classification = classification
        if txn.reconciliation_state in ("pending", "imported"):
            txn.reconciliation_state = "verified"
        txn.updated_at = _now_str()
        audit = ClassificationAudit(
            transaction_id=txn.id,
            source="merchant_profile_update",
            category_id=category_id,
            classification=classification,
            merchant_name=profile.name,
            note="Applied merchant profile update",
            created_at=_now_str(),
        )
        session.add(audit)
        updated += 1
    return updated


@router.post("/transactions/{transaction_id}", response_model=ClassificationResult)
def classify_transaction(transaction_id: int, session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    payload = build_transaction_payload(session, txn)
    result = classify_payload(session, payload)
    apply_classification(session, transaction_id, result)
    if result.get("category_id"):
        txn.reconciliation_state = "verified"
        txn.updated_at = _now_str()
    session.commit()
    return result


@router.post("/bulk", response_model=dict)
def bulk_classify(payload: BulkClassifyRequest, session: Session = Depends(get_session)):
    if payload.transaction_ids:
        txns = session.execute(select(Transaction).where(Transaction.id.in_(payload.transaction_ids))).scalars().all()
    else:
        txns = session.execute(select(Transaction)).scalars().all()
    classified = 0
    errors: list[dict] = []
    for txn in txns:
        if is_legacy_opening_transaction(txn.description, txn.notes, txn.payee):
            continue
        try:
            result = classify_transaction_record(session, txn.id, force=payload.force)
            if result is not None:
                classified += 1
        except Exception as exc:
            errors.append({"transaction_id": txn.id, "error": str(exc)})
            continue
    session.commit()
    return {"classified": classified, "errors": errors}


@router.get("/merchants", response_model=list[MerchantProfileOut])
def list_merchants(session: Session = Depends(get_session)):
    return session.execute(select(MerchantProfile)).scalars().all()


@router.post("/merchants", response_model=MerchantProfileOut)
def create_merchant(payload: MerchantProfileCreate, session: Session = Depends(get_session)):
    if not payload.currency or not payload.currency.strip():
        raise HTTPException(status_code=400, detail="Currency is required")
    normalized = normalize_merchant(payload.name)
    currency = normalize_currency(payload.currency)
    existing = session.execute(
        select(MerchantProfile).where(
            MerchantProfile.normalized_name == normalized,
            MerchantProfile.currency == currency,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Merchant already exists for this currency")
    try:
        validate_subcategory_for_category(session, payload.default_category_id, payload.default_subcategory_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    profile = MerchantProfile(
        name=payload.name,
        normalized_name=normalized,
        currency=currency,
        default_category_id=payload.default_category_id,
        default_subcategory_id=payload.default_subcategory_id,
        default_classification=payload.default_classification,
        notes=payload.notes,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.post("/merchants/{merchant_id}")
def update_merchant(merchant_id: int, payload: MerchantProfileUpdate, session: Session = Depends(get_session)):
    profile = session.execute(
        select(MerchantProfile).where(MerchantProfile.id == merchant_id)
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Merchant not found")
    if not payload.currency or not payload.currency.strip():
        raise HTTPException(status_code=400, detail="Currency is required")
    normalized = normalize_merchant(payload.name)
    profile.name = payload.name
    profile.normalized_name = normalized
    currency = normalize_currency(payload.currency)
    duplicate = session.execute(
        select(MerchantProfile).where(
            MerchantProfile.normalized_name == normalized,
            MerchantProfile.currency == currency,
            MerchantProfile.id != profile.id,
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=400, detail="Merchant already exists for this currency")
    try:
        validate_subcategory_for_category(session, payload.default_category_id, payload.default_subcategory_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    profile.currency = currency
    profile.default_category_id = payload.default_category_id
    profile.default_subcategory_id = payload.default_subcategory_id
    profile.default_classification = payload.default_classification
    profile.notes = payload.notes
    profile.updated_at = _now_str()
    updated = 0
    if payload.apply_to_transactions:
        if not payload.default_category_id:
            raise HTTPException(status_code=400, detail="Select a category before applying to transactions")
        updated = _apply_profile_to_transactions(
            session,
            profile,
            payload.default_category_id,
            payload.default_classification,
            payload.default_subcategory_id,
        )
    session.commit()
    return {"status": "ok", "updated": updated}


@router.delete("/merchants/{merchant_id}")
def delete_merchant(merchant_id: int, session: Session = Depends(get_session)):
    profile = session.execute(
        select(MerchantProfile).where(MerchantProfile.id == merchant_id)
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Merchant not found")
    session.delete(profile)
    session.commit()
    return {"status": "ok"}


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
