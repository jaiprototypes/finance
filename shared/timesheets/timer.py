from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class TimerState:
    start_time: datetime | None = None


def _now():
    return datetime.now(tz=timezone.utc)


def start_timer(now: datetime | None = None) -> TimerState:
    current = now or _now()
    return TimerState(start_time=current)


def stop_timer(state: TimerState, now: datetime | None = None) -> dict:
    if not state.start_time:
        raise ValueError("Timer not started")
    end_time = now or _now()
    if end_time < state.start_time:
        raise ValueError("End time is before start time")
    duration_seconds = (end_time - state.start_time).total_seconds()
    return {
        "start_time": state.start_time,
        "end_time": end_time,
        "duration_seconds": int(duration_seconds),
        "duration_minutes": int(duration_seconds // 60),
    }


def compute_duration_minutes(start_time: datetime, end_time: datetime) -> int:
    if end_time < start_time:
        raise ValueError("End time is before start time")
    return int((end_time - start_time).total_seconds() // 60)

