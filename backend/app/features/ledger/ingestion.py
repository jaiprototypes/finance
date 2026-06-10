from __future__ import annotations

from ...core.time import utc_now_iso
from .models import Transaction
from ..classification.service import apply_classification, classify_payload


class LedgerIngestionService:
    def create_transaction(
        self,
        session,
        *,
        account_id: int,
        date: str,
        description: str,
        amount: float,
        currency: str,
        payee: str | None = None,
        notes: str | None = None,
        classification: str = "Personal",
        reconciliation_state: str = "imported",
        import_batch_id: int | None = None,
        auto_classify: bool = True,
        classification_payload: dict | None = None,
    ) -> tuple[Transaction, dict | None, str | None]:
        now = utc_now_iso()
        txn = Transaction(
            account_id=account_id,
            date=date,
            description=description,
            amount=amount,
            currency=currency,
            payee=payee,
            notes=notes,
            classification=classification,
            reconciliation_state=reconciliation_state,
            import_batch_id=import_batch_id,
            created_at=now,
            updated_at=now,
        )
        session.add(txn)
        session.flush()
        if not auto_classify:
            return txn, None, None
        try:
            payload = {
                "transaction_id": txn.id,
                "account_id": account_id,
                "date": date,
                "description": description,
                "amount": amount,
                "currency": currency,
                "payee": payee,
                "notes": notes,
                "classification": classification,
            }
            if classification_payload:
                payload.update({key: value for key, value in classification_payload.items() if value is not None})
            result = classify_payload(session, payload)
            apply_classification(session, txn.id, result)
            return txn, result, None
        except Exception as exc:
            return txn, None, str(exc)

