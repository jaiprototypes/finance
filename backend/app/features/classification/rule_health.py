"""Read-only diagnostics for broken classification rules and missing details."""

from collections import Counter

from sqlalchemy import func, select

from ...core.bank_activity import BankFeeMatcher
from ..ledger.account_roles import is_business_account
from ..ledger.models import Account, Transaction, TransactionSplit
from ..ledger.payment_reversals import payment_return_issues
from ..taxonomy.models import Category, Subcategory
from ..taxonomy.service import TRANSPORT_CATEGORY_NAME
from .merchant_subcategories import DebtMerchantRule, MERCHANT_SPENDING_RULES
from .models import ClassificationAudit, Rule
from .paypal_activity import PayPalActivity
from .employer_wages import ConfirmedEmployerRule
from .savings_transfers import SavingsTransferRule
from .grab_spending import GrabSpendingRule
from .family_subcategories import FamilyCounterpartyRule
from .yha_spending import YHALodgingRule, YHASpendingRule


class RuleHealthService:
    """Compare saved labels with explicit rules without rewriting reviewed records."""

    @staticmethod
    def _matches(rule, txn) -> bool:
        """Use the same literal matching operators as the classification rules."""
        value = str(getattr(txn, rule.field or "", "") or "").lower()
        target = (rule.value or "").lower()
        if not value or not target:
            return False
        operations = {"equals": value == target, "starts_with": value.startswith(target),
                      "ends_with": value.endswith(target), "contains": target in value}
        return operations.get(rule.operator or "contains", False)

    @staticmethod
    def _expected(txn, category_name=None, session=None) -> tuple[str, str | None] | None:
        """Share merchant definitions with the classifier instead of duplicating labels."""
        grab = GrabSpendingRule.classification_for({
            field: getattr(txn, field) for field in ("payee", "description", "amount")
        })
        if grab:
            return grab
        if ConfirmedEmployerRule.matches(txn.amount, txn.payee, txn.description):
            return ConfirmedEmployerRule.category_name, None
        if YHALodgingRule.matches_merchant(txn.payee, txn.description):
            return YHALodgingRule.category_name, YHALodgingRule.subcategory_name
        merchant = " ".join([txn.payee or "", txn.description or ""])
        debt_detail = DebtMerchantRule.name_for(merchant, category_is_debt=category_name == "Debt")
        if debt_detail:
            return "Debt", debt_detail
        if BankFeeMatcher.matches(txn.description, txn.payee):
            return "Bank Fees", None
        if session is not None and YHASpendingRule.matches_merchant(txn.payee, txn.description):
            payload = {field: getattr(txn, field) for field in ("payee", "description", "amount", "currency")}
            detail = YHASpendingRule.name_for(session, payload)
            if detail:
                return "Food", detail
        for rule in MERCHANT_SPENDING_RULES:
            if rule.matches(txn.amount, txn.payee, txn.description):
                return rule.category_name, rule.subcategory_name
        return None

    @classmethod
    def check(cls, txn, category_name, detail_name, rules, category_id=None, session=None) -> dict | None:
        """Identify a conflicting rule or a missing category/subcategory."""
        matched = [rule for rule in rules if cls._matches(rule, txn)]
        if len({rule.category_id for rule in matched}) > 1:
            return {"transaction_id": txn.id, "reason": "conflicting_rules",
                    "rule_ids": [rule.id for rule in matched]}
        if matched:
            if category_id != matched[0].category_id:
                return {"transaction_id": txn.id, "reason": "explicit_rule_drift",
                        "rule_id": matched[0].id, "expected_category_id": matched[0].category_id}
            if category_name != "Debt":
                # Respect a reviewed category, but still detect its missing merchant detail.
                expected = cls._expected(txn, category_name, session) if category_name in {"Lifestyle", TRANSPORT_CATEGORY_NAME, "Housing & Bills"} else None
                if not expected or expected[0] != category_name:
                    return None
        if category_name == "Friends & Family":
            family_detail = FamilyCounterpartyRule.name_for(txn.payee, txn.description)
            if family_detail and detail_name != family_detail:
                return {"transaction_id": txn.id, "reason": "merchant_rule_drift",
                        "expected_category": category_name, "expected_subcategory": family_detail}
            if PayPalActivity.generic_reference(txn.payee, txn.description):
                return {"transaction_id": txn.id, "reason": "paypal_without_purchase_or_person_context"}
        if category_name == "Transfers" and session is not None:
            expected_detail = SavingsTransferRule.name_for(session, {
                field: getattr(txn, field) for field in ("account_id", "payee", "description", "amount")
            })
            if expected_detail and detail_name != expected_detail:
                return {"transaction_id": txn.id, "reason": "savings_direction_drift",
                        "expected_category": "Transfers", "expected_subcategory": expected_detail}
        confirmed_wage = ConfirmedEmployerRule.matches(txn.amount, txn.payee, txn.description)
        if category_name in {"Business", "Transfers", "Friends & Family"} and not confirmed_wage:
            return None
        expected = cls._expected(txn, category_name, session)
        if expected and (category_name != expected[0] or (expected[1] and detail_name != expected[1])):
            return {"transaction_id": txn.id, "reason": "merchant_rule_drift",
                    "expected_category": expected[0], "expected_subcategory": expected[1],
                    "actual_category": category_name, "actual_subcategory": detail_name}
        return None

    @classmethod
    def scan(cls, session) -> dict:
        """Audit rules and existing single-split transactions with bounded query count."""
        categories = {row.id: row for row in session.scalars(select(Category)).all()}
        details = {row.id: row for row in session.scalars(select(Subcategory)).all()}
        rules = session.scalars(select(Rule).where(Rule.is_active == 1)).all()
        issues = payment_return_issues(session)
        for rule in rules:
            category = categories.get(rule.category_id)
            if not category or not category.is_active or not rule.value:
                issues.append({"rule_id": rule.id, "reason": "invalid_rule_target"})
        rows = session.execute(select(Transaction, TransactionSplit, Account)
            .join(TransactionSplit, TransactionSplit.transaction_id == Transaction.id)
            .join(Account, Account.id == Transaction.account_id)).all()
        split_counts = Counter(txn.id for txn, _, _ in rows)
        for txn, split, account in rows:
            confirmed_wage = ConfirmedEmployerRule.matches(txn.amount, txn.payee, txn.description)
            if split_counts[txn.id] != 1 or is_business_account(account):
                continue
            if txn.classification == "Business" and not confirmed_wage:
                continue
            category = categories.get(split.category_id)
            detail = details.get(split.subcategory_id)
            issue = cls.check(txn, category.name if category else None, detail.name if detail else None,
                              rules, split.category_id, session)
            if not issue and confirmed_wage and category and category.name == ConfirmedEmployerRule.category_name:
                if txn.classification != "Personal" or split.classification != "Personal":
                    issue = {"transaction_id": txn.id, "reason": "employer_classification_drift",
                             "expected_category": ConfirmedEmployerRule.category_name,
                             "expected_classification": "Personal"}
            if issue:
                issues.append(issue)
        latest = select(ClassificationAudit.transaction_id, func.max(ClassificationAudit.id).label("id")).group_by(
            ClassificationAudit.transaction_id).subquery()
        pending = session.execute(select(ClassificationAudit.transaction_id, ClassificationAudit.source)
            .join(latest, latest.c.id == ClassificationAudit.id)
            .where(ClassificationAudit.source.in_({"paypal_review", "food_subcategory_review", "unassigned_review",
                                                  "university_funding_review"}))).all()
        reviews = [{"transaction_id": txn_id, "reason": source} for txn_id, source in pending]
        return {"rules_checked": len(rules), "transactions_checked": len(split_counts),
                "issues_count": len(issues), "issues": issues, "review_count": len(reviews),
                "reviews": reviews, "automatic_repair": False}
