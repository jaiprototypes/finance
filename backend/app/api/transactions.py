from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..config import UPLOADS_DIR
from ..db import get_session
from ..models import (
    Account,
    Attachment,
    ArchivedInvoicePaymentLink,
    Transaction,
    TransactionSplit,
    Subcategory,
    TransactionTag,
    DebtPaymentLink,
    InvoicePaymentLink,
    TransactionMemory,
    ClassificationAudit,
    ImportRow,
)
from ..schemas import (
    TransactionCreate,
    TransactionOut,
    TransactionSplitCreate,
    TransactionSplitUpdate,
    ReconcileUpdate,
    MergeTransactionsRequest,
    TransactionUpdate,
)
from ..services.business_receivables import is_legacy_opening
from ..services.classification import apply_classification, clean_merchant, normalize_merchant
from ..services.invoice_tracking import auto_track_receivables
from ..services.subcategories import ensure_subcategory, subcategory_name, validate_subcategory_for_category

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _purge_transaction(session: Session, txn: Transaction) -> None:
    attachments = session.execute(
        select(Attachment).where(Attachment.transaction_id == txn.id)
    ).scalars().all()
    for attachment in attachments:
        file_path = Path(attachment.file_path)
        if file_path.exists():
            file_path.unlink(missing_ok=True)
    session.execute(Attachment.__table__.delete().where(Attachment.transaction_id == txn.id))
    session.execute(TransactionSplit.__table__.delete().where(TransactionSplit.transaction_id == txn.id))
    session.execute(TransactionTag.__table__.delete().where(TransactionTag.transaction_id == txn.id))
    session.execute(TransactionMemory.__table__.delete().where(TransactionMemory.transaction_id == txn.id))
    session.execute(ClassificationAudit.__table__.delete().where(ClassificationAudit.transaction_id == txn.id))
    session.execute(InvoicePaymentLink.__table__.delete().where(InvoicePaymentLink.transaction_id == txn.id))
    session.execute(
        ArchivedInvoicePaymentLink.__table__.delete().where(ArchivedInvoicePaymentLink.transaction_id == txn.id)
    )
    session.execute(DebtPaymentLink.__table__.delete().where(DebtPaymentLink.transaction_id == txn.id))
    session.delete(txn)


def _transaction_merchant(txn: Transaction) -> tuple[str | None, str | None]:
    raw = txn.payee or txn.description or ""
    cleaned = clean_merchant(raw)
    normalized = normalize_merchant(cleaned)
    if not normalized:
        return None, None
    return cleaned, normalized


def _apply_category_to_matching_merchants(
    session: Session,
    source_txn: Transaction,
    category_id: int,
    classification: str,
    subcategory_id: int | None = None,
) -> int:
    merchant_name, normalized = _transaction_merchant(source_txn)
    if not normalized:
        return 0
    txns = session.execute(select(Transaction)).scalars().all()
    splits = session.execute(select(TransactionSplit)).scalars().all()
    split_map: dict[int, list[TransactionSplit]] = {}
    for split in splits:
        split_map.setdefault(split.transaction_id, []).append(split)
    updated = 0
    for txn in txns:
        if txn.id == source_txn.id:
            continue
        other_name, other_norm = _transaction_merchant(txn)
        if other_norm != normalized:
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
            split.notes = "Merchant update"
        else:
            split = TransactionSplit(
                transaction_id=txn.id,
                category_id=category_id,
                subcategory_id=subcategory_id,
                amount=txn.amount,
                currency=txn.currency,
                classification=classification,
                notes="Merchant update",
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
            source="merchant_update",
            category_id=category_id,
            classification=classification,
            merchant_name=other_name or txn.payee or txn.description or merchant_name,
            note=(
                f"Applied to matching merchant"
                + (
                    f" · subcategory={subcategory_name(session, subcategory_id)}"
                    if subcategory_id
                    else ""
                )
            ),
            created_at=_now_str(),
        )
        session.add(audit)
        updated += 1
    return updated


@router.get("", response_model=list[TransactionOut])
def list_transactions(include_system: bool = False, session: Session = Depends(get_session)):
    rows = session.execute(select(Transaction)).scalars().all()
    if include_system:
        return rows
    return [txn for txn in rows if not is_legacy_opening(txn.description, txn.notes, txn.payee)]


@router.get("/details")
def list_transactions_details(include_system: bool = False, session: Session = Depends(get_session)):
    rows = session.execute(
        text(
            """
            SELECT t.*, a.name AS account_name
            FROM transactions t
            JOIN account a ON a.id = t.account_id
            ORDER BY t.date DESC, t.id DESC
            """
        )
    ).mappings().all()
    txns = [dict(r) for r in rows]
    if not include_system:
        txns = [
            txn
            for txn in txns
            if not is_legacy_opening(txn.get("description"), txn.get("notes"), txn.get("payee"))
        ]
    if not txns:
        return []
    txn_ids = {t["id"] for t in txns}
    splits = session.execute(
        text(
            """
            SELECT ts.id AS split_id, ts.transaction_id, ts.amount, ts.currency, ts.classification, ts.notes,
                   c.name AS category_name, ts.category_id,
                   sc.name AS subcategory_name, ts.subcategory_id
            FROM transaction_split ts
            LEFT JOIN category c ON c.id = ts.category_id
            LEFT JOIN subcategory sc ON sc.id = ts.subcategory_id
            """
        )
    ).mappings().all()
    split_map: dict[int, list[dict]] = {}
    for split in splits:
        if split["transaction_id"] in txn_ids:
            split_map.setdefault(split["transaction_id"], []).append(dict(split))
    for txn in txns:
        txn["splits"] = split_map.get(txn["id"], [])
    audits = session.execute(
        select(ClassificationAudit)
        .where(ClassificationAudit.transaction_id.in_(txn_ids))
        .order_by(ClassificationAudit.created_at.desc())
    ).scalars().all()
    audit_map: dict[int, ClassificationAudit] = {}
    for audit in audits:
        if audit.transaction_id not in audit_map:
            audit_map[audit.transaction_id] = audit
    for txn in txns:
        audit = audit_map.get(txn["id"])
        if audit:
            txn["classification_source"] = audit.source
            txn["classification_note"] = audit.note
            txn["classification_at"] = audit.created_at
    return txns


@router.post("", response_model=TransactionOut)
def create_transaction(payload: TransactionCreate, session: Session = Depends(get_session)):
    _validate_transaction_create(payload, session)
    txn = Transaction(
        account_id=payload.account_id,
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        currency=payload.currency,
        payee=payload.payee,
        notes=payload.notes,
        classification=payload.classification,
        reconciliation_state=payload.reconciliation_state,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(txn)
    session.flush()
    auto_track_receivables(session)
    session.commit()
    session.refresh(txn)
    return txn


@router.post("/verify-categorized")
def verify_categorized(session: Session = Depends(get_session)):
    result = session.execute(
        text(
            """
            UPDATE transactions
            SET reconciliation_state = 'verified', updated_at = :now
            WHERE reconciliation_state IN ('pending', 'imported')
              AND id IN (SELECT DISTINCT transaction_id FROM transaction_split)
            """
        ),
        {"now": _now_str()},
    )
    session.commit()
    return {"status": "ok", "updated": result.rowcount or 0}


@router.post("/{transaction_id}")
def update_transaction(transaction_id: int, payload: TransactionUpdate, session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _validate_transaction_update(payload)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(txn, field, value)
    txn.updated_at = _now_str()
    auto_track_receivables(session)
    session.commit()
    return {"status": "ok"}


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _purge_transaction(session, txn)
    auto_track_receivables(session)
    session.commit()
    return {"status": "ok"}


def _validate_transaction_create(payload: TransactionCreate, session: Session) -> None:
    account = session.execute(select(Account).where(Account.id == payload.account_id)).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=400, detail="Account not found")
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    if payload.amount == 0:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")
    _validate_date(payload.date)


def _validate_transaction_update(payload: TransactionUpdate) -> None:
    if payload.description is not None and not payload.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    if payload.amount is not None and payload.amount == 0:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")
    if payload.date is not None:
        _validate_date(payload.date)


def _validate_date(value: str) -> None:
    from datetime import datetime

    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be ISO format (YYYY-MM-DD)")


@router.post("/{transaction_id}/splits")
def add_split(transaction_id: int, payload: TransactionSplitCreate, session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    subcategory = _resolve_subcategory(session, payload.category_id, payload.subcategory_id, payload.subcategory_name)
    split = TransactionSplit(
        transaction_id=transaction_id,
        category_id=payload.category_id,
        subcategory_id=subcategory.id if subcategory else None,
        amount=payload.amount,
        currency=payload.currency,
        classification=payload.classification,
        notes=payload.notes,
        business_percent=payload.business_percent,
    )
    session.add(split)
    session.flush()
    updated = 0
    if payload.category_id is not None:
        splits = session.execute(
            select(TransactionSplit).where(TransactionSplit.transaction_id == transaction_id)
        ).scalars().all()
        total = sum(s.amount for s in splits)
        if len(splits) == 1 and abs(total - txn.amount) < 0.01:
            merchant_name = clean_merchant(txn.payee or txn.description)
            classification = payload.classification or txn.classification or "Personal"
            apply_classification(
                session,
                transaction_id,
                {
                    "category_id": payload.category_id,
                    "subcategory_id": subcategory.id if subcategory else None,
                    "classification": classification,
                    "merchant_name": merchant_name or txn.payee or txn.description,
                    "source": "manual_split",
                    "note": "Manual category split",
                    "force_profile": True,
                },
            )
            if txn.reconciliation_state in ("pending", "imported"):
                txn.reconciliation_state = "verified"
                txn.updated_at = _now_str()
            updated = _apply_category_to_matching_merchants(
                session,
                txn,
                payload.category_id,
                classification,
                subcategory.id if subcategory else None,
            )
    session.commit()
    return {"status": "ok", "updated": updated}


@router.get("/{transaction_id}/splits")
def list_splits(transaction_id: int, session: Session = Depends(get_session)):
    rows = session.execute(
        text(
            """
            SELECT ts.id AS split_id, ts.transaction_id, ts.amount, ts.currency, ts.classification, ts.notes,
                   c.name AS category_name, ts.category_id,
                   sc.name AS subcategory_name, ts.subcategory_id
            FROM transaction_split ts
            LEFT JOIN category c ON c.id = ts.category_id
            LEFT JOIN subcategory sc ON sc.id = ts.subcategory_id
            WHERE ts.transaction_id = :transaction_id
            ORDER BY ts.id
            """
        ),
        {"transaction_id": transaction_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/splits/{split_id}")
def update_split(split_id: int, payload: TransactionSplitUpdate, session: Session = Depends(get_session)):
    split = session.execute(select(TransactionSplit).where(TransactionSplit.id == split_id)).scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Split not found")
    txn = session.execute(select(Transaction).where(Transaction.id == split.transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    category_id = payload.category_id if payload.category_id is not None else split.category_id
    if category_id is None:
        raise HTTPException(status_code=400, detail="Category is required")
    subcategory = _resolve_subcategory(session, category_id, payload.subcategory_id, payload.subcategory_name)
    classification = payload.classification or split.classification or txn.classification or "Personal"

    split.category_id = category_id
    split.subcategory_id = subcategory.id if subcategory else None
    split.classification = classification
    if payload.notes is not None:
        split.notes = payload.notes

    updated = 0
    txn_splits = session.execute(
        select(TransactionSplit).where(TransactionSplit.transaction_id == txn.id)
    ).scalars().all()
    total = sum(s.amount for s in txn_splits)
    if len(txn_splits) == 1 and abs(total - txn.amount) < 0.01:
        merchant_name = clean_merchant(txn.payee or txn.description)
        apply_classification(
            session,
            txn.id,
            {
                "category_id": category_id,
                "subcategory_id": subcategory.id if subcategory else None,
                "classification": classification,
                "merchant_name": merchant_name or txn.payee or txn.description,
                "source": "manual_split_update",
                "note": "Manual split update",
                "force_profile": True,
            },
        )
        if txn.reconciliation_state in ("pending", "imported"):
            txn.reconciliation_state = "verified"
            txn.updated_at = _now_str()
        if payload.cascade_matching_merchant:
            updated = _apply_category_to_matching_merchants(
                session,
                txn,
                category_id,
                classification,
                subcategory.id if subcategory else None,
            )
    session.commit()
    return {
        "status": "ok",
        "updated": updated,
        "subcategory_id": subcategory.id if subcategory else None,
        "subcategory_name": subcategory.name if subcategory else None,
    }


@router.post("/{transaction_id}/attachments")
def add_attachment(transaction_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{transaction_id}_{uuid4().hex}_{file.filename or 'attachment'}"
    target_path = Path(UPLOADS_DIR) / safe_name

    with target_path.open("wb") as out_file:
        out_file.write(file.file.read())

    attachment = Attachment(
        transaction_id=transaction_id,
        file_path=str(target_path),
        file_name=file.filename,
        mime_type=file.content_type,
        created_at=_now_str(),
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return {"id": attachment.id, "file_path": attachment.file_path}


@router.get("/{transaction_id}/attachments")
def list_attachments(transaction_id: int, session: Session = Depends(get_session)):
    rows = session.execute(
        select(Attachment).where(Attachment.transaction_id == transaction_id)
    ).scalars().all()
    return rows


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, session: Session = Depends(get_session)):
    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(attachment.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, filename=attachment.file_name or path.name)


@router.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, session: Session = Depends(get_session)):
    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = Path(attachment.file_path)
    session.delete(attachment)
    session.commit()
    if file_path.exists():
        file_path.unlink(missing_ok=True)
    return {"status": "ok"}


@router.post("/{transaction_id}/reconcile")
def update_reconcile(transaction_id: int, payload: ReconcileUpdate, session: Session = Depends(get_session)):
    txn = session.execute(select(Transaction).where(Transaction.id == transaction_id)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.reconciliation_state = payload.reconciliation_state
    txn.updated_at = _now_str()
    session.commit()
    return {"status": "ok", "reconciliation_state": txn.reconciliation_state}


@router.delete("/splits/{split_id}")
def delete_split(split_id: int, session: Session = Depends(get_session)):
    split = session.execute(select(TransactionSplit).where(TransactionSplit.id == split_id)).scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Split not found")
    session.delete(split)
    session.commit()
    return {"status": "ok"}


@router.post("/merge")
def merge_transactions(payload: MergeTransactionsRequest, session: Session = Depends(get_session)):
    primary = session.execute(select(Transaction).where(Transaction.id == payload.primary_id)).scalar_one_or_none()
    duplicate = session.execute(select(Transaction).where(Transaction.id == payload.duplicate_id)).scalar_one_or_none()
    if not primary or not duplicate:
        raise HTTPException(status_code=404, detail="Transaction not found")
    session.execute(
        TransactionSplit.__table__.update()
        .where(TransactionSplit.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        Attachment.__table__.update()
        .where(Attachment.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        TransactionTag.__table__.update()
        .where(TransactionTag.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        TransactionMemory.__table__.update()
        .where(TransactionMemory.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        InvoicePaymentLink.__table__.update()
        .where(InvoicePaymentLink.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        DebtPaymentLink.__table__.update()
        .where(DebtPaymentLink.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.execute(
        ImportRow.__table__.update()
        .where(ImportRow.transaction_id == duplicate.id)
        .values(transaction_id=primary.id)
    )
    session.delete(duplicate)
    session.commit()
    return {"status": "ok", "merged_into": primary.id}


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()


def _resolve_subcategory(
    session: Session,
    category_id: int | None,
    subcategory_id: int | None,
    subcategory_name_value: str | None,
) -> Subcategory | None:
    if not category_id:
        if subcategory_id or (subcategory_name_value or "").strip():
            raise HTTPException(status_code=400, detail="Select a category before assigning a subcategory")
        return None
    if (subcategory_name_value or "").strip():
        try:
            return ensure_subcategory(session, category_id, subcategory_name_value or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if subcategory_id:
        try:
            return validate_subcategory_for_category(session, category_id, subcategory_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    return None
