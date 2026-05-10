#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
from collections import defaultdict
from pathlib import Path

from backend.app.db import init_db, session_scope
from backend.app.services.budget_groups import _build_merchant_stats, EMBEDDING_BATCH_SIZE


CONTROL_CHARS = re.compile(r"[\x00-\x1F\x7F]")


def _count_non_ascii(value: str) -> int:
    return sum(1 for ch in value if ord(ch) > 127)


def _summarize_batch(entries: list[dict]) -> dict:
    names = [row.get("display_name") or "" for row in entries]
    lengths = [len(name) for name in names]
    longest_name = max(names, key=len) if names else ""
    shortest_name = min(names, key=len) if names else ""
    control_hits = [name for name in names if CONTROL_CHARS.search(name)]
    non_ascii_hits = [name for name in names if _count_non_ascii(name) > 0]
    over_200 = [name for name in names if len(name) > 200]
    return {
        "count": len(entries),
        "min_len": min(lengths) if lengths else 0,
        "max_len": max(lengths) if lengths else 0,
        "avg_len": round(sum(lengths) / len(lengths), 2) if lengths else 0,
        "longest_name": longest_name,
        "shortest_name": shortest_name,
        "control_char_count": len(control_hits),
        "non_ascii_count": len(non_ascii_hits),
        "over_200_count": len(over_200),
        "control_char_samples": control_hits[:10],
        "non_ascii_samples": non_ascii_hits[:10],
        "over_200_samples": over_200[:10],
    }


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect embedding batches for budget group training.")
    parser.add_argument("--currency", default="", help="Filter to a single currency (ex: AUD).")
    parser.add_argument("--batch", default="last", help="Batch index (1-based) or 'last'.")
    parser.add_argument(
        "--export-dir",
        default="backend/tmp/embedding_batches",
        help="Directory to write JSON reports.",
    )
    args = parser.parse_args()

    init_db()
    with session_scope() as session:
        merchant_stats, preprocess_report = _build_merchant_stats(session)

    by_currency: dict[str, list[dict]] = defaultdict(list)
    for entry in merchant_stats:
        by_currency[entry.get("currency") or ""].append(entry)

    export_dir = Path(args.export_dir)
    summary: dict[str, dict] = {
        "batch_size": EMBEDDING_BATCH_SIZE,
        "preprocess": preprocess_report,
        "currencies": {},
    }

    for currency, rows in by_currency.items():
        if args.currency and currency.upper() != args.currency.upper():
            continue
        total_batches = math.ceil(len(rows) / EMBEDDING_BATCH_SIZE) if rows else 0
        batches = []
        for idx in range(total_batches):
            start = idx * EMBEDDING_BATCH_SIZE
            end = start + EMBEDDING_BATCH_SIZE
            chunk = rows[start:end]
            batches.append({"index": idx + 1, "entries": chunk})
        summary["currencies"][currency or "Unknown"] = {
            "merchants": len(rows),
            "batches": total_batches,
        }

        target_batches = batches
        if args.batch and args.batch.lower() != "all":
            if args.batch.lower() == "last":
                target_batches = batches[-1:] if batches else []
            else:
                try:
                    requested = int(args.batch)
                except ValueError:
                    requested = 1
                target_batches = [b for b in batches if b["index"] == requested]

        for batch in target_batches:
            chunk = batch["entries"]
            batch_index = batch["index"]
            batch_label = f"{currency or 'unknown'}_batch_{batch_index}"
            batch_summary = _summarize_batch(chunk)
            detail = {
                "currency": currency or "Unknown",
                "batch_index": batch_index,
                "batch_size": len(chunk),
                "summary": batch_summary,
                "entries": [
                    {
                        "display_name": row.get("display_name") or "",
                        "normalized": row.get("normalized") or "",
                        "currency": row.get("currency") or "",
                        "count": row.get("count") or 0,
                        "avg_abs": row.get("avg_abs") or 0.0,
                        "median_abs": row.get("median_abs") or 0.0,
                        "length": len(row.get("display_name") or ""),
                        "non_ascii": _count_non_ascii(row.get("display_name") or ""),
                        "has_control_chars": bool(CONTROL_CHARS.search(row.get("display_name") or "")),
                    }
                    for row in chunk
                ],
            }
            _write_json(export_dir / f"{batch_label}.json", detail)

    _write_json(export_dir / "summary.json", summary)
    print(f"Wrote reports to {export_dir}")
    print(f"Summary: {export_dir / 'summary.json'}")


if __name__ == "__main__":
    main()
