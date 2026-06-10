#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend.app.db import init_db, session_scope
from backend.app.features.receivables.archived_invoices import import_archived_invoice_file, parse_invoice_pdf


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import historical invoice PDFs into the local archived-invoice library."
    )
    parser.add_argument(
        "--invoice-path",
        action="append",
        default=[],
        help="Path to a specific historical invoice PDF. Repeat as needed.",
    )
    parser.add_argument(
        "--invoice-dir",
        action="append",
        default=[],
        help="Directory containing invoice PDFs. Repeat as needed.",
    )
    parser.add_argument(
        "--status",
        default="archived",
        help="Archived invoice status to apply to imported files. Default: archived",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report what would import without writing to the local database.",
    )
    return parser.parse_args()


def collect_pdf_paths(args: argparse.Namespace) -> list[Path]:
    ordered: list[Path] = []
    seen: set[Path] = set()
    for raw in args.invoice_path:
        path = Path(raw).expanduser()
        if path not in seen:
            ordered.append(path)
            seen.add(path)
    for raw in args.invoice_dir:
        base = Path(raw).expanduser()
        if not base.exists():
            ordered.append(base)
            continue
        for path in sorted(base.glob("*.pdf")):
            if path not in seen:
                ordered.append(path)
                seen.add(path)
    return ordered


def main() -> int:
    args = parse_args()
    pdf_paths = collect_pdf_paths(args)
    if not pdf_paths:
        print("No invoice PDFs were provided.")
        return 1

    init_db()
    imported = 0
    duplicates = 0
    skipped = 0

    with session_scope() as session:
        for path in pdf_paths:
            if not path.exists():
                print(f"SKIP missing file: {path}")
                skipped += 1
                continue
            if path.suffix.lower() != ".pdf":
                print(f"SKIP not a PDF: {path}")
                skipped += 1
                continue

            parsed = parse_invoice_pdf(path)
            if not parsed.get("client_name") and not parsed.get("number"):
                print(f"SKIP not recognized as invoice: {path.name}")
                skipped += 1
                continue

            summary = (
                f"{path.name}: client={parsed.get('client_name') or 'unknown'} "
                f"invoice={parsed.get('number') or 'n/a'} total={parsed.get('total') or 0}"
            )
            if args.dry_run:
                print(f"DRY RUN {summary}")
                continue

            try:
                record = import_archived_invoice_file(
                    session,
                    path,
                    status=args.status,
                    source_label="historical-import",
                )
                session.commit()
                imported += 1
                print(
                    f"IMPORTED {path.name} -> archived_invoice:{record.id} "
                    f"client_id={record.client_id} number={record.number or 'n/a'} total={record.total:.2f}"
                )
            except FileExistsError:
                duplicates += 1
                session.rollback()
                print(f"DUPLICATE {path.name}")
            except Exception as exc:
                skipped += 1
                session.rollback()
                print(f"SKIP {path.name}: {exc}")

    print(f"Summary: imported={imported} duplicates={duplicates} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
