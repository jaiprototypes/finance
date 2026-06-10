from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...db import get_session
from .service import seed_demo_data, reset_demo_data

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/seed")
def seed(session: Session = Depends(get_session)):
    result = seed_demo_data(session)
    session.commit()
    return result


@router.post("/reset")
def reset(session: Session = Depends(get_session)):
    result = reset_demo_data(session)
    session.commit()
    return result

