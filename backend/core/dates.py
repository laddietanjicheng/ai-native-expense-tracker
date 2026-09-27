from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SGT = ZoneInfo("Asia/Singapore")


def today_sgt() -> date:
    return datetime.now(SGT).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, delta: int) -> date:
    month_index = d.year * 12 + (d.month - 1) + delta
    year, month = divmod(month_index, 12)
    return date(year, month + 1, 1)


def month_end(d: date) -> date:
    return add_months(month_start(d), 1) - timedelta(days=1)


def days_in_month(d: date) -> int:
    start = month_start(d)
    return (add_months(start, 1) - start).days


def is_current_month(d: date, today: date) -> bool:
    return month_start(d) == month_start(today)


def parse_month_param(value: str) -> date:
    try:
        year_str, month_str = value.split("-")
        return date(int(year_str), int(month_str), 1)
    except (ValueError, TypeError) as exc:
        raise ValueError("month must be in YYYY-MM format") from exc
