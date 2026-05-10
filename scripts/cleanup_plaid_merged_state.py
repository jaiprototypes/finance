#!/usr/bin/env python3
from __future__ import annotations

import json

from sqlalchemy import text

from backend.app.db import session_scope


def main() -> None:
    with session_scope() as session:
        affected_ids = [
            row[0]
            for row in session.execute(
                text(
                    """
                    SELECT transaction_id
                    FROM transaction_split
                    GROUP BY transaction_id
                    HAVING COUNT(*) > 1
                    UNION
                    SELECT transaction_id
                    FROM classification_audit
                    GROUP BY transaction_id
                    HAVING COUNT(*) > 1
                    """
                )
            ).all()
        ]
        if not affected_ids:
            print(json.dumps({"affected_transactions": 0, "deleted_splits": 0, "deleted_memory": 0, "deleted_audits": 0}, indent=2))
            return

        params = {f"id{i}": value for i, value in enumerate(affected_ids)}
        id_list = ", ".join(f":id{i}" for i in range(len(affected_ids)))

        deleted_splits = session.execute(
            text(
                f"""
                DELETE FROM transaction_split
                WHERE transaction_id IN ({id_list})
                  AND id NOT IN (
                    SELECT MIN(id)
                    FROM transaction_split
                    WHERE transaction_id IN ({id_list})
                    GROUP BY transaction_id
                  )
                """
            ),
            params,
        ).rowcount or 0

        deleted_memory = session.execute(
            text(
                f"""
                DELETE FROM transaction_memory
                WHERE transaction_id IN ({id_list})
                  AND id NOT IN (
                    SELECT MIN(id)
                    FROM transaction_memory
                    WHERE transaction_id IN ({id_list})
                    GROUP BY transaction_id
                  )
                """
            ),
            params,
        ).rowcount or 0

        deleted_audits = session.execute(
            text(
                f"""
                DELETE FROM classification_audit
                WHERE transaction_id IN ({id_list})
                  AND id NOT IN (
                    SELECT MIN(id)
                    FROM classification_audit
                    WHERE transaction_id IN ({id_list})
                    GROUP BY transaction_id
                  )
                """
            ),
            params,
        ).rowcount or 0

        print(
            json.dumps(
                {
                    "affected_transactions": len(affected_ids),
                    "deleted_splits": deleted_splits,
                    "deleted_memory": deleted_memory,
                    "deleted_audits": deleted_audits,
                },
                indent=2,
                ensure_ascii=True,
            )
        )


if __name__ == "__main__":
    main()
