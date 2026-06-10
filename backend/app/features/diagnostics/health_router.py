from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "ts": datetime.now(tz=timezone.utc).isoformat()}

