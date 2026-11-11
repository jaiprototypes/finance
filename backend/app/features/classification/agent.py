"""Local, explainable classification learned only from confirmed corrections."""

import json
import re
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, select

from ..ledger.models import Transaction, TransactionSplit
from ..settings.service import get_setting, set_setting
from ..taxonomy.models import Category, Subcategory
from .models import ClassificationAudit
from .yha_spending import YHASpendingRule
from .merchant_subcategories import CarltonTobaccoRule
from .university_funding import UniversityFundingRule


class ClassificationAgent:
    """Learn exact merchant policies scoped to account, currency and direction."""

    setting_key = "classification_agent_model"
    training_sources = {
        "manual_split_update", "merchant_profile_update", "manual_merchant_group_correction",
        "manual_cafe_keyword_correction", "manual_bank_fee_correction",
        "manual_friends_family_correction",
    }
    generic_merchants = {"square", "paypal", "stripe", "visa", "mastercard", "card purchase"}

    @classmethod
    def _key(cls, payload: dict) -> str | None:
        """Keep accounts and incoming/outgoing examples separate."""
        # Amount-dependent YHA decisions must never become merchant-wide policies.
        if CarltonTobaccoRule.matches_merchant(payload.get("payee"), payload.get("description")):
            return None
        if YHASpendingRule.matches_merchant(payload.get("payee"), payload.get("description")):
            return None
        if UniversityFundingRule.matches(payload):
            return None
        merchant = payload.get("payee") or payload.get("description") or ""
        merchant = " ".join(re.sub(r"[^a-z0-9]+", " ", merchant.lower()).split())
        amount = payload.get("amount")
        if not merchant or merchant in cls.generic_merchants or not amount:
            return None
        scope = [payload.get("account_id"), str(payload.get("currency") or "").upper(),
                 "in" if float(amount) > 0 else "out", merchant]
        return json.dumps(scope, separators=(",", ":"))

    @classmethod
    def _load(cls, session) -> dict:
        """Read the portable local model without a global cache or extra runtime."""
        raw = get_setting(session, cls.setting_key)
        return json.loads(raw) if raw else {"samples": {}, "policies": {}, "conflicts": []}

    @classmethod
    def _save(cls, session, samples: dict) -> dict:
        """Use unanimous labels; contradictory examples require review."""
        groups = defaultdict(set)
        for sample in samples.values():
            groups[sample["key"]].add(tuple(sample["label"]))
        model = {
            "samples": samples,
            "policies": {key: list(next(iter(labels))) for key, labels in groups.items() if len(labels) == 1},
            "conflicts": [key for key, labels in groups.items() if len(labels) > 1],
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
        set_setting(session, cls.setting_key, json.dumps(model, separators=(",", ":")))
        return cls._summary(model)

    @staticmethod
    def _summary(model: dict) -> dict:
        """Expose model health without exposing merchant or account details."""
        return {"samples": len(model["samples"]), "learned_merchants": len(model["policies"]),
                "conflicts": len(model["conflicts"]), "trained_at": model.get("trained_at"),
                "automatic_import_classification": True}

    @classmethod
    def status(cls, session) -> dict:
        """Report persisted training state."""
        from .rule_health import RuleHealthService
        report = cls._summary(cls._load(session))
        health = RuleHealthService.scan(session)
        report["rule_health"] = {key: value for key, value in health.items() if key not in {"issues", "reviews"}}
        report["irs_return_timing"] = get_setting(session, "irs_return_timing", "standard")
        return report

    @classmethod
    def _sample(cls, txn, split) -> dict | None:
        """Use complete single-category transactions, never partial allocations."""
        key = cls._key({name: getattr(txn, name) for name in
                        ("account_id", "currency", "amount", "payee", "description")})
        if not key or not split.category_id or abs(split.amount - txn.amount) >= 0.005:
            return None
        return {"key": key, "label": [split.category_id, split.subcategory_id, split.classification]}

    @classmethod
    def train(cls, session) -> dict:
        """Rebuild from latest reviewed labels, without reclassifying saved records."""
        latest = select(ClassificationAudit.transaction_id, func.max(ClassificationAudit.id).label("id")).group_by(
            ClassificationAudit.transaction_id).subquery()
        rows = session.execute(select(Transaction, TransactionSplit, ClassificationAudit)
            .join(TransactionSplit, TransactionSplit.transaction_id == Transaction.id)
            .join(latest, latest.c.transaction_id == Transaction.id)
            .join(ClassificationAudit, ClassificationAudit.id == latest.c.id)
            .where(ClassificationAudit.source.in_(cls.training_sources))).all()
        grouped = defaultdict(list)
        for txn, split, audit in rows:
            grouped[txn.id].append((txn, split, audit))
        samples = {}
        for txn_id, records in grouped.items():
            if len(records) != 1:
                continue
            txn, split, audit = records[0]
            if split.category_id != audit.category_id:
                continue
            sample = cls._sample(txn, split)
            if sample:
                samples[str(txn_id)] = sample
        return cls._save(session, samples)

    @classmethod
    def learn(cls, session, txn, result: dict) -> None:
        """Incrementally learn explicit reusable corrections in the same DB transaction."""
        if result.get("source") not in cls.training_sources or result.get("skip_agent_learning"):
            return
        splits = session.scalars(select(TransactionSplit).where(TransactionSplit.transaction_id == txn.id)).all()
        model = cls._load(session)
        model["samples"].pop(str(txn.id), None)
        if len(splits) == 1:
            sample = cls._sample(txn, splits[0])
            if sample:
                model["samples"][str(txn.id)] = sample
        cls._save(session, model["samples"])

    @classmethod
    def predict(cls, session, payload: dict) -> dict | None:
        """Return an auditable learned label, or abstain on unfamiliar/conflicting data."""
        key = cls._key(payload)
        if key is None:
            return None
        model = cls._load(session)
        if key in model["conflicts"]:
            return {"category_id": None, "classification": "Personal", "source": "agent_conflict",
                    "needs_review": True, "note": "Conflicting reviewed merchant examples"}
        label = model["policies"].get(key)
        if not label:
            return None
        category = session.get(Category, label[0])
        detail = session.get(Subcategory, label[1]) if label[1] else None
        if not category or not category.is_active:
            return None
        if label[1] and (not detail or not detail.is_active or detail.category_id != category.id):
            return None
        return {"category_id": category.id, "category_name": category.name,
                "subcategory_id": detail.id if detail else None,
                "subcategory_name": detail.name if detail else None, "classification": label[2],
                "source": "classification_agent", "note": "Matched unanimous reviewed merchant examples",
                "skip_profile": True, "skip_memory": True}
