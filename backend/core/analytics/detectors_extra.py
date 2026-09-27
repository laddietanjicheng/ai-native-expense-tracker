"""Detectors D6-D10 (spec §4.1). D1-D5 live in detectors.py to keep files small."""

import statistics
from datetime import timedelta

from core.analytics.constants import (
    ANOMALY_MEDIAN_MIN_COUNT,
    ANOMALY_MEDIAN_WINDOW_DAYS,
    ANOMALY_OUTLIER_MIN_CENTS,
    ANOMALY_OUTLIER_MULTIPLE,
    BUDGET_CLOSED_MONTHS,
    BUDGET_UNDER_PCT,
    LOGGING_ACTIVE_DAY_SHARE,
    LOGGING_GAP_DAYS,
    LOGGING_LOOKBACK_DAYS,
    OTHER_MIN_CENTS,
    OTHER_SHARE_MIN,
    ROUND_TO_CENTS,
    TREND_MIN_NET_CENTS,
    TREND_MIN_NET_PCT,
    TREND_MONTHS,
    WIN_BUDGET_STREAK_MIN,
    WIN_FALL_MONTHS,
)
from core.analytics.formatting import fmt_money, fmt_pct
from core.analytics.models import (
    Candidate,
    CategoryInfo,
    ExpenseRow,
    Ledger,
    Proposal,
    ProposalRow,
    in_month,
    total_cents,
)
from core.dates import add_months, month_end, month_start


def _sorted_top_categories(ledger: Ledger) -> list[CategoryInfo]:
    return sorted(ledger.top_by_id.values(), key=lambda c: c.name.lower())


def _sorted_budgets(ledger: Ledger) -> list:
    return sorted(ledger.budgets, key=lambda b: (b.category_id is not None, str(b.category_id)))


def _budget_name(ledger: Ledger, category_id) -> str:
    if category_id is None:
        return "Overall"
    category = ledger.top_by_id.get(category_id)
    return category.name if category else "Unknown"


def d6_trend(ledger: Ledger) -> list[Candidate]:
    candidates = []
    for top in _sorted_top_categories(ledger):
        totals = [
            sum(r.amount_cents for r in ledger.month_rows(-i) if r.category_id == top.id)
            for i in range(TREND_MONTHS - 1, -1, -1)
        ]
        if any(t == 0 for t in totals):
            continue
        rising = all(a < b for a, b in zip(totals, totals[1:], strict=False))
        falling = all(a > b for a, b in zip(totals, totals[1:], strict=False))
        if not (rising or falling):
            continue
        net = totals[-1] - totals[0]
        if abs(net) < TREND_MIN_NET_CENTS or abs(net) / totals[0] < TREND_MIN_NET_PCT:
            continue
        candidates.append(
            Candidate(
                kind="trend",
                subject=top.name,
                impact_cents=abs(net),
                display=[*[fmt_money(t) for t in totals], fmt_money(net)],
            )
        )
    return candidates


def _closed_months_before(month) -> list:
    return [add_months(month_start(month), -i) for i in range(1, BUDGET_CLOSED_MONTHS + 1)]


def d7_budget(ledger: Ledger) -> list[Candidate]:
    candidates = []
    for budget in _sorted_budgets(ledger):
        months = _closed_months_before(ledger.month)
        totals = [
            sum(
                r.amount_cents
                for r in in_month(ledger.rows, m)
                if (budget.category_id is None or r.category_id == budget.category_id)
            )
            for m in months
        ]
        cap = budget.amount_cents
        name = _budget_name(ledger, budget.category_id)
        if all(t > cap for t in totals):
            avg = round(sum(totals) / len(totals))
            suggested = -(-avg // ROUND_TO_CENTS) * ROUND_TO_CENTS
            candidates.append(
                Candidate(
                    kind="budget",
                    subject=name,
                    impact_cents=avg - cap,
                    display=[fmt_money(cap), fmt_money(suggested)],
                    proposal=Proposal(
                        title=f"Raise the {name} budget",
                        rows=[
                            ProposalRow(
                                category_id=budget.category_id,
                                name=name,
                                from_cents=cap,
                                to_cents=suggested,
                                reason="Over budget for 3 months running",
                            )
                        ],
                        footer=f"Based on the last {BUDGET_CLOSED_MONTHS} months' average spend.",
                    ),
                )
            )
        elif all(t < cap * BUDGET_UNDER_PCT for t in totals):
            highest = max(totals)
            suggested = -(-highest // ROUND_TO_CENTS) * ROUND_TO_CENTS
            freed = cap - suggested
            if freed > 0:
                candidates.append(
                    Candidate(
                        kind="budget",
                        subject=name,
                        impact_cents=freed,
                        display=[fmt_money(cap), fmt_money(suggested), fmt_money(freed)],
                        proposal=Proposal(
                            title=f"Lower the {name} budget",
                            rows=[
                                ProposalRow(
                                    category_id=budget.category_id,
                                    name=name,
                                    from_cents=cap,
                                    to_cents=suggested,
                                    reason="Consistently under budget",
                                )
                            ],
                            footer=f"Frees up {fmt_money(freed)} a month.",
                        ),
                    )
                )
    return candidates


def d8_anomaly(ledger: Ledger) -> list[Candidate]:
    current = sorted(ledger.month_rows(0), key=lambda r: (r.expense_date, str(r.id)))
    candidates = []

    dup_groups: dict[tuple, list[ExpenseRow]] = {}
    for r in current:
        dup_groups.setdefault((r.amount_cents, r.category_id, r.expense_date, r.note), []).append(r)
    for key in sorted(dup_groups, key=str):
        amount, category_id, expense_date, _note = key
        rows = dup_groups[key]
        if len(rows) >= 2:
            category = ledger.top_by_id.get(category_id) or ledger.sub_by_id.get(category_id)
            category_name = category.name if category else "expense"
            candidates.append(
                Candidate(
                    kind="anomaly",
                    subject=f"Duplicate — {category_name} on {expense_date.isoformat()}",
                    impact_cents=amount * (len(rows) - 1),
                    display=[fmt_money(amount), str(len(rows))],
                )
            )

    for r in current:
        window_start = r.expense_date - timedelta(days=ANOMALY_MEDIAN_WINDOW_DAYS)
        history = [
            h.amount_cents
            for h in ledger.rows
            if h.category_id == r.category_id and window_start <= h.expense_date < r.expense_date
        ]
        if len(history) < ANOMALY_MEDIAN_MIN_COUNT:
            continue
        median = statistics.median(history)
        if (
            median
            and r.amount_cents >= ANOMALY_OUTLIER_MULTIPLE * median
            and r.amount_cents >= ANOMALY_OUTLIER_MIN_CENTS
        ):
            category = ledger.top_by_id.get(r.category_id)
            category_name = category.name if category else "expense"
            candidates.append(
                Candidate(
                    kind="anomaly",
                    subject=f"Outlier — {category_name} on {r.expense_date.isoformat()}",
                    impact_cents=r.amount_cents,
                    display=[fmt_money(r.amount_cents), fmt_money(round(median))],
                )
            )
    return candidates


def d9_win(ledger: Ledger) -> list[Candidate]:
    candidates = []
    for top in _sorted_top_categories(ledger):
        totals = [
            sum(r.amount_cents for r in ledger.month_rows(-i) if r.category_id == top.id)
            for i in range(WIN_FALL_MONTHS - 1, -1, -1)
        ]
        falling = all(a > b for a, b in zip(totals, totals[1:], strict=False))
        if all(t > 0 for t in totals) and falling:
            candidates.append(
                Candidate(
                    kind="win",
                    subject=top.name,
                    impact_cents=totals[0] - totals[-1],
                    display=[fmt_money(t) for t in totals],
                )
            )

    for budget in _sorted_budgets(ledger):
        prev_spent = sum(
            r.amount_cents
            for r in ledger.month_rows(-1)
            if budget.category_id is None or r.category_id == budget.category_id
        )
        current_spent = sum(
            r.amount_cents
            for r in ledger.month_rows(0)
            if budget.category_id is None or r.category_id == budget.category_id
        )
        if prev_spent > budget.amount_cents and current_spent <= budget.amount_cents:
            name = _budget_name(ledger, budget.category_id)
            candidates.append(
                Candidate(
                    kind="win",
                    subject=f"{name} budget kept",
                    impact_cents=budget.amount_cents - current_spent,
                    display=[fmt_money(current_spent), fmt_money(budget.amount_cents)],
                )
            )

    for budget in _sorted_budgets(ledger):
        if budget.category_id is not None:
            continue
        streak = 0
        for m in _closed_months_before(ledger.month):
            spent = sum(r.amount_cents for r in in_month(ledger.rows, m))
            if spent <= budget.amount_cents:
                streak += 1
            else:
                break
        if streak >= WIN_BUDGET_STREAK_MIN:
            candidates.append(
                Candidate(
                    kind="win",
                    subject="Overall budget streak",
                    impact_cents=budget.amount_cents,
                    display=[str(streak)],
                )
            )
    return candidates


def d10_logging(ledger: Ledger) -> list[Candidate]:
    candidates = []
    current = sorted(ledger.month_rows(0), key=lambda r: r.expense_date)
    history_start = ledger.month - timedelta(days=LOGGING_LOOKBACK_DAYS)
    history_days = {r.expense_date for r in ledger.rows if r.expense_date >= history_start}
    total_days = max((ledger.month - history_start).days, 1)
    active_share = len(history_days) / total_days
    if active_share >= LOGGING_ACTIVE_DAY_SHARE and current:
        days_with_expenses = sorted({r.expense_date for r in current})
        bounds = [
            month_start(ledger.month) - timedelta(days=1),
            *days_with_expenses,
            month_end(ledger.month) + timedelta(days=1),
        ]
        for a, b in zip(bounds, bounds[1:], strict=False):
            gap = (b - a).days
            if gap - 1 >= LOGGING_GAP_DAYS:
                candidates.append(
                    Candidate(
                        kind="logging",
                        subject=f"Gap {a.isoformat()}–{b.isoformat()}",
                        impact_cents=gap * 100,
                        display=[str(gap - 1)],
                    )
                )

    current_all = ledger.month_rows(0)
    total = total_cents(current_all)
    other = next((c for c in ledger.top_by_id.values() if c.name == "Other"), None)
    if other and total:
        other_total = sum(r.amount_cents for r in current_all if r.category_id == other.id)
        share = other_total / total
        if share >= OTHER_SHARE_MIN and other_total >= OTHER_MIN_CENTS:
            candidates.append(
                Candidate(
                    kind="logging",
                    subject="Other category",
                    impact_cents=other_total,
                    display=[fmt_pct(share), fmt_money(other_total)],
                )
            )
    return candidates
