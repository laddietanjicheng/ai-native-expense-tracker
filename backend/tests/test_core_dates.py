from datetime import UTC, date, datetime

import core.dates as core_dates


class _FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        instant = datetime(2026, 6, 30, 16, 30, tzinfo=UTC)
        return instant.astimezone(tz) if tz else instant


def test_today_sgt_is_ahead_of_utc_near_midnight(monkeypatch):
    # 2026-06-30 16:30 UTC is 2026-07-01 00:30 in Singapore (UTC+8).
    monkeypatch.setattr(core_dates, "datetime", _FixedDatetime)
    assert core_dates.today_sgt() == date(2026, 7, 1)


def test_is_current_month_uses_injected_today():
    assert core_dates.is_current_month(date(2026, 7, 1), date(2026, 7, 15)) is True
    assert core_dates.is_current_month(date(2026, 6, 1), date(2026, 7, 15)) is False


def test_days_in_month_handles_february_leap_year():
    assert core_dates.days_in_month(date(2028, 2, 10)) == 29
    assert core_dates.days_in_month(date(2026, 2, 10)) == 28
