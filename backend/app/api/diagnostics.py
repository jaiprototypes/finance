import io
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import LOG_DIR, DB_PATH, BACKUP_DIR
from ..db import get_session

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("/export")
def export_diagnostics():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if DB_PATH.exists():
            zf.write(DB_PATH, arcname="finance.db")
        for path in LOG_DIR.glob("*.jsonl"):
            zf.write(path, arcname=f"logs/{path.name}")
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip")


@router.get("/health")
def diagnostics_health(session: Session = Depends(get_session)):
    session.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/status")
def diagnostics_status(session: Session = Depends(get_session)):
    counts = {}
    for table in [
        "account",
        "transactions",
        "transaction_split",
        "category",
        "client",
        "invoice",
        "archived_invoice",
        "archived_invoice_payment_link",
        "import_batch",
        "fx_rate",
        "time_entry",
        "debt_profile",
    ]:
        counts[table] = session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
    return {
        "status": "ok",
        "db_path": str(DB_PATH),
        "counts": counts,
    }


@router.post("/backup")
def create_backup():
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="Database not found")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_name = f"finance_backup_{stamp}.db"
    target = BACKUP_DIR / backup_name
    shutil.copy2(DB_PATH, target)
    return {"backup": backup_name, "path": str(target)}


@router.get("/backups")
def list_backups():
    if not BACKUP_DIR.exists():
        return []
    backups = sorted(BACKUP_DIR.glob("*.db"), key=lambda p: p.name, reverse=True)
    return [{"name": p.name, "path": str(p), "size": p.stat().st_size} for p in backups]


@router.post("/restore")
def restore_backup(backup_name: str):
    backup_path = Path(BACKUP_DIR) / backup_name
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    shutil.copy2(backup_path, DB_PATH)
    return {"status": "ok", "restored": backup_name}
