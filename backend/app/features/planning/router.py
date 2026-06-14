from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...db import get_session
from .service import planning_overview

router = APIRouter(prefix="/planning", tags=["planning"])


def _default_year(year: int | None) -> int:
    return year or datetime.now().year


@router.get("")
def get_planning(year: int | None = None, session: Session = Depends(get_session)):
    try:
        return planning_overview(session, _default_year(year))
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/overview")
def get_planning_overview(year: int | None = None, session: Session = Depends(get_session)):
    return get_planning(year=year, session=session)
