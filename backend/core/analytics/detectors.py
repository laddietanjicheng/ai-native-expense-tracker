"""Detectors D1-D5 (spec §4.1). D6-D10 live in detectors_extra.py to keep files small."""

import re

from core.analytics.constants import (
    CHANGE_MIN_ABS_CENTS,
    CHANGE_MIN_PCT,
    LEAK_MAX_ITEM_CENTS,
    LEAK_MIN_COUNT,
    LEAK_MIN_SUM_CENTS,
    OTHER_SUBJECT_SUFFIX,
    RECURRING_PRICE_CHANGE_PCT,
    RECURRING_TOLERANCE_PCT,
    RECURRING_WINDOW_MONTHS,
    TIMING_EARLY_MONTH_DAYS,
    TIMING_EARLY_MONTH_SHARE,
    TIMING_WEEKEND_MIN_COUNT,
    TIMING_WEEKEND_SHARE,
    TIMING_WINDOW_MONTHS,
)
from core.analytics.formatting import fmt_money, fmt_pct
from core.analytics.models import (
    Candidate,
    CategoryInfo,
    ExpenseRow,
    Ledger,
    budget_status,
    in_month,
    subject_groups,
    total_cents,
)
from core.dates import add_months, month_start


def _sorted_top_categories(ledger: Ledger) -> list[CategoryInfo]:
    return sorted(ledger.top_by_id.values(), key=lambda c: c.name.lower())


def d1_pace(ledger: Ledger) -> list[Candidate]:
    if not ledger.is_current_month:
        return []
    overall = ledger.budget_for(None)
    if overall is None:
        return []
    spent = total_cents(ledger.month_rows(0))
    days_left = max(ledger.days_in_month - ledger.days_elapsed + 1, 1)
    remaining = overall.amount_cents - spent
    daily_allowance = round(remaining / days_left)
    projected = (
        round(spent / ledger.days_elapsed * ledger.days_in_month) if ledger.days_elapsed else spent
    )
    status = budget_status(spent, overall.amount_cents, projected, True)
    return [
        Candidate(
            kind="pace",
            subject="Overall",
            impact_cents=abs(remaining),
            display=[
                fmt_money(remaining),
                str(days_left),
                fmt_money(daily_allowance),
                fmt_money(projected),
                status,
            ],
        )
    ]


def _driver(now_cents: int, prev_cents: int, now_count: int, prev_count: int) -> str:
    avg_now = now_cents / now_count if now_count else 0
    avg_prev = prev_cents / prev_count if prev_count else 0
    delta_count = now_count - prev_count
    delta_avg = avg_now - avg_prev
    return "frequency" if abs(delta_count * avg_prev) >= abs(delta_avg * now_count) else "price"


def d2_change(ledger: Ledger) -> list[Candidate]:
    current = ledger.month_rows(0)
    previous = ledger.month_rows(-1)
    candidates = []
    for top in _sorted_top_categories(ledger):
        subs = ledger.subs_of.get(top.id, [])
        for label, predicate in subject_groups(top, subs):
            now_rows = [r for r in current if predicate(r)]
            prev_rows = [r for r in previous if predicate(r)]
            now_cents, prev_cents = total_cents(now_rows), total_cents(prev_rows)
            delta = now_cents - prev_cents
            if abs(delta) < CHANGE_MIN_ABS_CENTS:
                continue
            if prev_cents == 0 or abs(delta) / prev_cents < CHANGE_MIN_PCT:
                continue
            driver = _driver(now_cents, prev_cents, len(now_rows), len(prev_rows))
            avg3 = round(
                sum(
                    total_cents(
                        r
                        for r in in_month(ledger.rows, add_months(month_start(ledger.month), -i))
                        if predicate(r)
                    )
                    for i in (1, 2, 3)
                )
                / 3
            )
            candidates.append(
                Candidate(
                    kind="change",
                    subject=label,
                    impact_cents=abs(delta),
                    display=[
                        fmt_money(now_cents),
                        fmt_money(prev_cents),
                        fmt_pct(abs(delta) / prev_cents),
                        fmt_money(avg3),
                        driver,
                    ],
                )
            )
    return candidates


def d3_leak(ledger: Ledger) -> list[Candidate]:
    current = ledger.month_rows(0)
    candidates = []
    for top in _sorted_top_categories(ledger):
        subs = ledger.subs_of.get(top.id, [])
        for label, predicate in subject_groups(top, subs):
            small = [r for r in current if predicate(r) and r.amount_cents <= LEAK_MAX_ITEM_CENTS]
            total = total_cents(small)
            if len(small) >= LEAK_MIN_COUNT and total >= LEAK_MIN_SUM_CENTS:
                candidates.append(
                    Candidate(
                        kind="leak",
                        subject=label,
                        impact_cents=total,
                        display=[
                            str(len(small)),
                            fmt_money(total),
                            fmt_money(round(total / len(small))),
                        ],
                    )
                )
    return candidates


def _normalize_note(note: str | None) -> str | None:
    if not note:
        return None
    return re.sub(r"\s+", " ", note.strip().lower()) or None


def _series_key(row: ExpenseRow) -> tuple:
    note = _normalize_note(row.note)
    if note:
        return ("note", note)
    return ("sub", row.sub_category_id, row.category_id, row.amount_cents // 100)


def _series_label(ledger: Ledger, row: ExpenseRow) -> str:
    """Never the raw note: notes may only be used to *match* a series, not to describe it."""
    sub = ledger.sub_by_id.get(row.sub_category_id)
    if sub:
        return sub.name
    top = ledger.top_by_id.get(row.category_id)
    category_name = top.name if top else "expense"
    has_subs = bool(ledger.subs_of.get(row.category_id))
    return f"{category_name}{OTHER_SUBJECT_SUFFIX}" if has_subs else category_name


def _confirmed_series(ledger: Ledger, month) -> dict[tuple, list[ExpenseRow]]:
    months = [add_months(month_start(month), -i) for i in range(RECURRING_WINDOW_MONTHS)]
    by_month: list[dict[tuple, list[ExpenseRow]]] = []
    for m in months:
        grouped: dict[tuple, list[ExpenseRow]] = {}
        for r in in_month(ledger.rows, m):
            grouped.setdefault(_series_key(r), []).append(r)
        by_month.append(grouped)

    all_keys = set(by_month[0]) & set(by_month[1]) & set(by_month[2])
    confirmed = {}
    for key in all_keys:
        occurrences = [max(by_month[i][key], key=lambda r: r.amount_cents) for i in range(3)]
        amounts = [o.amount_cents for o in occurrences]
        base = amounts[-1] or 1
        if any(abs(a - base) / base > RECURRING_TOLERANCE_PCT for a in amounts):
            continue
        confirmed[key] = occurrences
    return confirmed


def d4_recurring(ledger: Ledger) -> list[Candidate]:
    current_series = _confirmed_series(ledger, ledger.month)
    if not current_series:
        return []
    previous_series = _confirmed_series(ledger, add_months(month_start(ledger.month), -1))

    monthly_total = sum(occurrences[0].amount_cents for occurrences in current_series.values())
    candidates = []
    for key in sorted(current_series, key=str):
        occurrences = current_series[key]
        latest, previous_occ = occurrences[0].amount_cents, occurrences[1].amount_cents
        price_change = previous_occ and abs(latest - previous_occ) / previous_occ >= (
            RECURRING_PRICE_CHANGE_PCT
        )
        is_new = key not in previous_series
        label = _series_label(ledger, occurrences[0])

        display = [fmt_money(latest), fmt_money(monthly_total)]
        if price_change:
            display.append(fmt_money(previous_occ))
        if is_new:
            display.append("new")
        candidates.append(
            Candidate(kind="recurring", subject=label, impact_cents=latest, display=display)
        )
    return candidates


def d5_timing(ledger: Ledger) -> list[Candidate]:
    months = [add_months(month_start(ledger.month), -i) for i in range(TIMING_WINDOW_MONTHS)]
    window_rows = [r for m in months for r in in_month(ledger.rows, m)]
    candidates = []
    for top in _sorted_top_categories(ledger):
        rows = [r for r in window_rows if r.category_id == top.id]
        total = total_cents(rows)
        if not rows or total == 0:
            continue
        weekend_rows = [r for r in rows if r.expense_date.weekday() >= 5]
        weekend_share = total_cents(weekend_rows) / total
        if weekend_share >= TIMING_WEEKEND_SHARE and len(weekend_rows) >= TIMING_WEEKEND_MIN_COUNT:
            candidates.append(
                Candidate(
                    kind="timing",
                    subject=top.name,
                    impact_cents=total_cents(weekend_rows),
                    display=[fmt_pct(weekend_share), fmt_money(total_cents(weekend_rows))],
                )
            )
            continue
        early_rows = [r for r in rows if r.expense_date.day <= TIMING_EARLY_MONTH_DAYS]
        early_share = total_cents(early_rows) / total
        if early_share >= TIMING_EARLY_MONTH_SHARE:
            candidates.append(
                Candidate(
                    kind="timing",
                    subject=top.name,
                    impact_cents=total_cents(early_rows),
                    display=[fmt_pct(early_share), fmt_money(total_cents(early_rows))],
                )
            )
    return candidates
