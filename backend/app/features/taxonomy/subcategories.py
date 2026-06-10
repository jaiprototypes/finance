from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Subcategory


def normalize_subcategory_name(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def get_subcategory(session: Session, subcategory_id: int | None) -> Subcategory | None:
    if not subcategory_id:
        return None
    return session.execute(
        select(Subcategory).where(Subcategory.id == int(subcategory_id))
    ).scalar_one_or_none()


def ensure_subcategory(session: Session, category_id: int, name: str) -> Subcategory:
    normalized_name = normalize_subcategory_name(name)
    if not normalized_name:
        raise ValueError("Subcategory name is required")
    existing = session.execute(
        select(Subcategory).where(
            Subcategory.category_id == int(category_id),
            Subcategory.normalized_name == normalized_name,
        )
    ).scalar_one_or_none()
    if existing:
        if existing.is_active != 1:
            existing.is_active = 1
        return existing
    subcategory = Subcategory(
        category_id=int(category_id),
        name=" ".join((name or "").strip().split()),
        normalized_name=normalized_name,
        is_active=1,
    )
    session.add(subcategory)
    session.flush()
    return subcategory


def subcategory_name(session: Session, subcategory_id: int | None) -> str | None:
    row = get_subcategory(session, subcategory_id)
    return row.name if row else None


def validate_subcategory_for_category(
    session: Session,
    category_id: int | None,
    subcategory_id: int | None,
) -> Subcategory | None:
    if not subcategory_id:
        return None
    row = get_subcategory(session, subcategory_id)
    if not row:
        raise ValueError("Subcategory not found")
    if category_id and int(row.category_id) != int(category_id):
        raise ValueError("Subcategory does not belong to the selected category")
    return row
