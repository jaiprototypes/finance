import json
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import ImportBatch, Account
from ..services.imports import create_import_batch, preview_csv, import_csv, rollback_batch
from ..services.invoice_tracking import auto_track_receivables

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/preview")
def preview(file: UploadFile = File(...), mapping_json: str = Form(...)):
    mapping = json.loads(mapping_json)
    _validate_mapping(mapping)
    contents = file.file.read()
    return preview_csv(contents, mapping)


@router.post("/commit")
def commit(
    account_id: int = Form(...),
    default_currency: str = Form(...),
    source: str | None = Form(None),
    auto_classify: bool = Form(True),
    mapping_json: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    mapping = json.loads(mapping_json)
    _validate_mapping(mapping)
    account = session.execute(select(Account).where(Account.id == account_id)).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=400, detail="Account not found")
    contents = file.file.read()
    batch = create_import_batch(session, source, file.filename)
    summary = import_csv(session, batch, contents, mapping, account_id, default_currency, auto_classify=auto_classify)
    tracking = auto_track_receivables(session)
    session.commit()
    return {"batch_id": batch.id, "summary": summary, "invoice_tracking": tracking}


@router.get("/batches")
def list_batches(session: Session = Depends(get_session)):
    return session.execute(select(ImportBatch).order_by(ImportBatch.created_at.desc())).scalars().all()


@router.post("/batches/{batch_id}/rollback")
def rollback(batch_id: int, session: Session = Depends(get_session)):
    result = rollback_batch(session, batch_id)
    session.commit()
    return result


def _validate_mapping(mapping: dict) -> None:
    required = ["date", "description", "amount"]
    missing = [field for field in required if not mapping.get(field)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing mapping for: {', '.join(missing)}")
