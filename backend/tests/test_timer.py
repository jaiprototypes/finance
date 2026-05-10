from datetime import datetime, timezone

from shared.timesheets import start_timer, stop_timer


def test_timer_duration_minutes():
    start = datetime(2024, 6, 1, 9, 0, tzinfo=timezone.utc)
    end = datetime(2024, 6, 1, 10, 30, tzinfo=timezone.utc)
    state = start_timer(start)
    result = stop_timer(state, end)
    assert result["duration_minutes"] == 90

