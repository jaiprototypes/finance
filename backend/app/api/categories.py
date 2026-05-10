from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Category, MerchantProfile, Subcategory, TransactionSplit
from ..schemas import CategoryCreate, CategoryOut, SubcategoryCreate, SubcategoryOut
from ..services.subcategories import ensure_subcategory, normalize_subcategory_name

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(include_inactive: bool = False, session: Session = Depends(get_session)):
    query = select(Category).order_by(Category.name)
    if not include_inactive:
        query = query.where(Category.is_active == 1)
    categories = session.execute(query).scalars().all()
    subcategory_query = select(Subcategory).order_by(Subcategory.name)
    if not include_inactive:
        subcategory_query = subcategory_query.where(Subcategory.is_active == 1)
    subcategories = session.execute(subcategory_query).scalars().all()
    subcategory_map: dict[int, list[Subcategory]] = {}
    for subcategory in subcategories:
        subcategory_map.setdefault(subcategory.category_id, []).append(subcategory)
    return [
        CategoryOut.model_validate(
            {
                "id": category.id,
                "name": category.name,
                "personal_allowed": bool(category.personal_allowed),
                "business_allowed": bool(category.business_allowed),
                "tax_code": category.tax_code,
                "is_active": bool(category.is_active),
                "subcategories": subcategory_map.get(category.id, []),
            }
        )
        for category in categories
    ]


@router.post("", response_model=CategoryOut)
def create_category(payload: CategoryCreate, session: Session = Depends(get_session)):
    category = Category(
        name=payload.name,
        personal_allowed=1 if payload.personal_allowed else 0,
        business_allowed=1 if payload.business_allowed else 0,
        tax_code=payload.tax_code,
        is_active=1 if payload.is_active else 0,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.post("/{category_id}")
def update_category(category_id: int, payload: CategoryCreate, session: Session = Depends(get_session)):
    category = session.execute(select(Category).where(Category.id == category_id)).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.name = payload.name
    category.personal_allowed = 1 if payload.personal_allowed else 0
    category.business_allowed = 1 if payload.business_allowed else 0
    category.tax_code = payload.tax_code
    category.is_active = 1 if payload.is_active else 0
    session.commit()
    return {"status": "ok"}


@router.delete("/{category_id}")
def delete_category(category_id: int, session: Session = Depends(get_session)):
    category = session.execute(select(Category).where(Category.id == category_id)).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    session.delete(category)
    session.commit()
    return {"status": "ok"}


@router.post("/{category_id}/subcategories", response_model=SubcategoryOut)
def create_subcategory(category_id: int, payload: SubcategoryCreate, session: Session = Depends(get_session)):
    category = session.execute(select(Category).where(Category.id == category_id)).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Subcategory name is required")
    try:
        subcategory = ensure_subcategory(session, category_id, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    subcategory.is_active = 1 if payload.is_active else 0
    session.commit()
    session.refresh(subcategory)
    return subcategory


@router.post("/subcategories/{subcategory_id}", response_model=SubcategoryOut)
def update_subcategory(subcategory_id: int, payload: SubcategoryCreate, session: Session = Depends(get_session)):
    subcategory = session.execute(
        select(Subcategory).where(Subcategory.id == subcategory_id)
    ).scalar_one_or_none()
    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Subcategory name is required")
    normalized_name = normalize_subcategory_name(payload.name)
    duplicate = session.execute(
        select(Subcategory).where(
            Subcategory.category_id == subcategory.category_id,
            Subcategory.normalized_name == normalized_name,
            Subcategory.id != subcategory.id,
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=400, detail="Subcategory already exists for this category")
    subcategory.name = " ".join(payload.name.strip().split())
    subcategory.normalized_name = normalized_name
    subcategory.is_active = 1 if payload.is_active else 0
    session.commit()
    session.refresh(subcategory)
    return subcategory


@router.delete("/subcategories/{subcategory_id}")
def delete_subcategory(subcategory_id: int, session: Session = Depends(get_session)):
    subcategory = session.execute(
        select(Subcategory).where(Subcategory.id == subcategory_id)
    ).scalar_one_or_none()
    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    split_count = session.query(TransactionSplit).filter(TransactionSplit.subcategory_id == subcategory_id).count()
    profile_count = session.query(MerchantProfile).filter(MerchantProfile.default_subcategory_id == subcategory_id).count()

    session.query(TransactionSplit).filter(TransactionSplit.subcategory_id == subcategory_id).update(
        {TransactionSplit.subcategory_id: None},
        synchronize_session=False,
    )
    session.query(MerchantProfile).filter(MerchantProfile.default_subcategory_id == subcategory_id).update(
        {MerchantProfile.default_subcategory_id: None},
        synchronize_session=False,
    )
    session.delete(subcategory)
    session.commit()
    return {"status": "ok", "cleared_splits": split_count, "cleared_profiles": profile_count}
