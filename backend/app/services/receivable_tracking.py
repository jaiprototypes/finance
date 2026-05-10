from __future__ import annotations

from datetime import datetime, timezone

AUTO_RECEIPT_SCORE_MIN = 125
AUTO_RECEIPT_SCORE_GAP = 25


def select_auto_receipt_candidate(candidates: list[dict[str, object]], target_amount: float) -> dict[str, object] | None:
    exact_candidates = [
        candidate
        for candidate in candidates
        if abs(float(candidate.get("available_amount") or 0.0) - target_amount) < 0.01
    ]
    if not exact_candidates:
        return None
    exact_candidates.sort(key=_candidate_rank_key, reverse=True)
    candidate = exact_candidates[0]
    score = int(candidate.get("match_score") or 0)
    if score < AUTO_RECEIPT_SCORE_MIN:
        return None
    next_best = _candidate_score(exact_candidates[1]) if len(exact_candidates) > 1 else 0
    if next_best and score - next_best < AUTO_RECEIPT_SCORE_GAP:
        return None
    reason = str(candidate.get("match_reason") or "").lower()
    if "match" not in reason:
        return None
    return candidate


def days_overdue(due_date: str | None, status: str | None, balance_due: float) -> int:
    if str(status or "").lower() not in {"sent", "partial", "archived"}:
        return 0
    if balance_due <= 0.005:
        return 0
    due_day = parse_date(due_date)
    if not due_day:
        return 0
    today = datetime.now(tz=timezone.utc).date()
    if due_day >= today:
        return 0
    return (today - due_day).days


def tracking_state(status: str | None, balance_due: float, overdue_days: int) -> str:
    current = str(status or "").lower() or "draft"
    if current == "void":
        return "void"
    if current == "draft":
        return "draft"
    if current == "paid" or balance_due <= 0.005:
        return "paid"
    if overdue_days > 0:
        return "overdue"
    return "awaiting-payment"


def parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _candidate_rank_key(candidate: dict[str, object]) -> tuple[int, str, float, int]:
    return (
        _candidate_score(candidate),
        str(candidate.get("date") or ""),
        float(candidate.get("available_amount") or 0.0),
        int(candidate.get("id") or 0),
    )


def _candidate_score(candidate: dict[str, object]) -> int:
    return int(candidate.get("match_score") or 0)
