#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, text

from backend.app.config import BACKUP_DIR, DB_PATH
from backend.app.db import session_scope
from backend.app.features.budgeting.models import BudgetCategoryTarget
from backend.app.features.classification.models import ClassificationAudit, MerchantProfile, Rule, TransactionMemory
from backend.app.features.ledger.models import TransactionSplit
from backend.app.features.taxonomy.service import ACTIVE_CATEGORY_NAMES, canonicalize_category_name
from backend.app.features.taxonomy.models import Category


def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"finance_category_consolidation_backup_{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return target


def ensure_category(session, name: str) -> Category:
    row = session.execute(select(Category).where(Category.name == name)).scalar_one_or_none()
    if row:
        row.is_active = 1
        return row
    row = Category(
        name=name,
        personal_allowed=1,
        business_allowed=1,
        tax_code=None,
        is_active=1,
    )
    session.add(row)
    session.flush()
    return row


def remap_foreign_keys(session, source_id: int, target_id: int) -> None:
    session.execute(
        TransactionSplit.__table__.update()
        .where(TransactionSplit.category_id == source_id)
        .values(category_id=target_id)
    )
    session.execute(
        MerchantProfile.__table__.update()
        .where(MerchantProfile.default_category_id == source_id)
        .values(default_category_id=target_id)
    )
    session.execute(
        TransactionMemory.__table__.update()
        .where(TransactionMemory.category_id == source_id)
        .values(category_id=target_id)
    )
    session.execute(
        ClassificationAudit.__table__.update()
        .where(ClassificationAudit.category_id == source_id)
        .values(category_id=target_id)
    )
    session.execute(
        Rule.__table__.update()
        .where(Rule.category_id == source_id)
        .values(category_id=target_id)
    )
    session.execute(
        BudgetCategoryTarget.__table__.update()
        .where(BudgetCategoryTarget.category_id == source_id)
        .values(category_id=target_id)
    )


def collapse_budget_targets(session) -> None:
    rows = session.execute(
        select(BudgetCategoryTarget).order_by(
            BudgetCategoryTarget.budget_month_id, BudgetCategoryTarget.category_id, BudgetCategoryTarget.id
        )
    ).scalars().all()
    grouped: dict[tuple[int, int], list[BudgetCategoryTarget]] = defaultdict(list)
    for row in rows:
        grouped[(row.budget_month_id, row.category_id)].append(row)
    for duplicates in grouped.values():
        if len(duplicates) <= 1:
            continue
        primary = duplicates[0]
        primary.amount = float(sum(float(row.amount or 0.0) for row in duplicates))
        primary.rollover_amount = float(sum(float(row.rollover_amount or 0.0) for row in duplicates))
        for extra in duplicates[1:]:
            session.delete(extra)


def active_category_names(session) -> list[str]:
    return [
        row.name
        for row in session.execute(
            select(Category).where(Category.is_active == 1).order_by(Category.name)
        ).scalars().all()
    ]


def main() -> None:
    backup_path = create_backup()
    merged: list[dict[str, str | int]] = []
    with session_scope() as session:
        for broad_name in ACTIVE_CATEGORY_NAMES:
            ensure_category(session, broad_name)

        categories = session.execute(select(Category).order_by(Category.id)).scalars().all()
        for category in categories:
            canonical_name = canonicalize_category_name(category.name)
            if not canonical_name or canonical_name == category.name:
                if canonical_name in ACTIVE_CATEGORY_NAMES:
                    category.is_active = 1
                continue

            target = ensure_category(session, canonical_name)
            target.personal_allowed = 1 if (target.personal_allowed or category.personal_allowed) else 0
            target.business_allowed = 1 if (target.business_allowed or category.business_allowed) else 0
            if not target.tax_code and category.tax_code:
                target.tax_code = category.tax_code

            remap_foreign_keys(session, category.id, target.id)
            category.is_active = 0
            merged.append(
                {
                    "source_id": category.id,
                    "source_name": category.name,
                    "target_id": target.id,
                    "target_name": target.name,
                }
            )

        collapse_budget_targets(session)
        session.flush()

        active_names = active_category_names(session)
        counts = {
            "active_categories": len(active_names),
            "budget_targets": session.execute(text("SELECT COUNT(*) FROM budget_category_target")).scalar_one(),
            "rules": session.execute(text("SELECT COUNT(*) FROM rule")).scalar_one(),
        }

    print(
        json.dumps(
            {
                "backup_path": str(backup_path),
                "merged": merged,
                "active_categories": active_names,
                "counts": counts,
            },
            indent=2,
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
