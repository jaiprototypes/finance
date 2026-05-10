#!/usr/bin/env python3
from __future__ import annotations

import argparse

from sqlalchemy import select

from backend.app.db import init_db, session_scope
from backend.app.models import ArchivedInvoice, Client, Invoice, Project


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge one client record into another.")
    parser.add_argument("--source-client-id", required=True, type=int)
    parser.add_argument("--target-client-id", required=True, type=int)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.source_client_id == args.target_client_id:
        raise SystemExit("Source and target client IDs must be different.")

    init_db()
    with session_scope() as session:
        source = session.execute(
            select(Client).where(Client.id == args.source_client_id)
        ).scalar_one_or_none()
        target = session.execute(
            select(Client).where(Client.id == args.target_client_id)
        ).scalar_one_or_none()
        if not source or not target:
            raise SystemExit("Both source and target clients must exist.")

        session.execute(
            Invoice.__table__.update()
            .where(Invoice.client_id == source.id)
            .values(client_id=target.id)
        )
        session.execute(
            ArchivedInvoice.__table__.update()
            .where(ArchivedInvoice.client_id == source.id)
            .values(client_id=target.id)
        )
        session.execute(
            Project.__table__.update()
            .where(Project.client_id == source.id)
            .values(client_id=target.id)
        )
        session.execute(
            Client.__table__.update()
            .where(Client.id == source.id)
            .values(is_active=0)
        )
        source_name = (source.name or "").strip()
        target_notes = (target.notes or "").strip()
        alias_note = f"Alias: {source_name}" if source_name else ""
        if alias_note and alias_note not in target_notes:
            session.execute(
                Client.__table__.update()
                .where(Client.id == target.id)
                .values(notes=f"{target_notes}\n{alias_note}".strip())
            )

    print(
        f"Merged client {args.source_client_id} into {args.target_client_id}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
