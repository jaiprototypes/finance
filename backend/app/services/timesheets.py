from datetime import datetime

from shared.timesheets import compute_duration_minutes


def ensure_duration(entry: dict) -> int:
    if entry.get("start_time") and entry.get("end_time"):
        start = _parse_time(entry["start_time"])
        end = _parse_time(entry["end_time"])
        return compute_duration_minutes(start, end)
    return int(entry["duration_minutes"])


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)

