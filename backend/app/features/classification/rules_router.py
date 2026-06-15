from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from .models import Rule
from .schemas import RuleCreate, RuleOut

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("", response_model=list[RuleOut])
def list_rules(session: Session = Depends(get_session)):
    return session.execute(select(Rule).order_by(Rule.id.desc())).scalars().all()


@router.post("", response_model=RuleOut)
def create_rule(payload: RuleCreate, session: Session = Depends(get_session)):
    rule = Rule(
        name=payload.name,
        field=payload.field,
        operator=payload.operator,
        value=payload.value,
        category_id=payload.category_id,
        payee=payload.payee,
        memo_contains=payload.memo_contains,
        is_active=1 if payload.is_active else 0,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.post("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, payload: RuleCreate, session: Session = Depends(get_session)):
    rule = session.execute(select(Rule).where(Rule.id == rule_id)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.name = payload.name
    rule.field = payload.field
    rule.operator = payload.operator
    rule.value = payload.value
    rule.category_id = payload.category_id
    rule.payee = payload.payee
    rule.memo_contains = payload.memo_contains
    rule.is_active = 1 if payload.is_active else 0
    session.commit()
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.execute(select(Rule).where(Rule.id == rule_id)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()
    return {"status": "ok"}

