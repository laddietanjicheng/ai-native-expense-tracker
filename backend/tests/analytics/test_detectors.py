from datetime import date, timedelta

from core.analytics.detectors import d1_pace, d2_change, d3_leak, d4_recurring, d5_timing
from core.analytics.detectors_extra import d6_trend, d7_budget, d8_anomaly, d9_win, d10_logging
from tests.analytics.factories import make_budget, make_category, make_ledger, make_row

CLOSED_MONTH = date(2026, 6, 1)


def test_d1_pace_hand_computed_values():
    food = make_category("Food")
    budget = make_budget(100_000)
    rows = [make_row(food.id, 30_000, date(2026, 9, 5))]
    ledger = make_ledger(date(2026, 9, 1), rows, [food], [budget], today=date(2026, 9, 26))

    candidates = d1_pace(ledger)

    assert len(candidates) == 1
    # days_left = 30 - 26 + 1 = 5; remaining = 70_000; allowance = 14_000; projected = 34_615
    assert candidates[0].display == ["S$700.00", "5", "S$140.00", "S$346.15", "On track"]


def test_d1_pace_does_not_fire_without_budget():
    food = make_category("Food")
    rows = [make_row(food.id, 30_000, date(2026, 9, 5))]
    ledger = make_ledger(date(2026, 9, 1), rows, [food], today=date(2026, 9, 26))
    assert d1_pace(ledger) == []


def test_d1_pace_does_not_fire_for_closed_month():
    food = make_category("Food")
    budget = make_budget(100_000)
    rows = [make_row(food.id, 30_000, date(2026, 6, 5))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food], [budget])
    assert d1_pace(ledger) == []


def test_d1_pace_status_over_when_spent_exceeds_cap():
    food = make_category("Food")
    budget = make_budget(10_000)
    rows = [make_row(food.id, 20_000, date(2026, 9, 5))]
    ledger = make_ledger(date(2026, 9, 1), rows, [food], [budget], today=date(2026, 9, 26))
    assert d1_pace(ledger)[0].display[-1] == "Over"


def test_d2_change_driver_is_frequency_when_count_dominates():
    food = make_category("Food")
    rows = [
        make_row(food.id, 5_000, date(2026, 6, 10)),
        make_row(food.id, 5_000, date(2026, 6, 15)),
        make_row(food.id, 6_500, date(2026, 5, 10)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d2_change(ledger)
    assert len(candidates) == 1
    assert candidates[0].display[-1] == "frequency"


def test_d2_change_driver_is_price_when_count_unchanged():
    food = make_category("Food")
    rows = [
        make_row(food.id, 10_000, date(2026, 6, 15)),
        make_row(food.id, 6_500, date(2026, 5, 15)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d2_change(ledger)
    assert candidates[0].display[-1] == "price"


def test_d2_change_groups_uncategorised_spend_as_other():
    food = make_category("Food")
    dining = make_category("Dining Out", parent_id=food.id)
    rows = [
        make_row(food.id, 10_000, date(2026, 6, 15)),  # no sub-category chosen
        make_row(food.id, 6_500, date(2026, 5, 15)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food, dining])
    candidates = d2_change(ledger)
    assert any(c.subject == "Food (other)" for c in candidates)


def test_d2_change_does_not_fire_below_absolute_threshold():
    food = make_category("Food")
    rows = [
        make_row(food.id, 6_600, date(2026, 6, 15)),
        make_row(food.id, 6_500, date(2026, 5, 15)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    assert d2_change(ledger) == []


def test_d3_leak_hand_computed_values():
    food = make_category("Food")
    rows = [make_row(food.id, 1_000, date(2026, 6, day)) for day in range(1, 9)]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d3_leak(ledger)
    assert len(candidates) == 1
    assert candidates[0].display == ["8", "S$80.00", "S$10.00"]


def test_d3_leak_groups_uncategorised_spend_as_other():
    food = make_category("Food")
    dining = make_category("Dining Out", parent_id=food.id)
    rows = [make_row(food.id, 1_000, date(2026, 6, day)) for day in range(1, 9)]
    ledger = make_ledger(CLOSED_MONTH, rows, [food, dining])
    candidates = d3_leak(ledger)
    assert candidates[0].subject == "Food (other)"


def test_d3_leak_does_not_fire_below_count_threshold():
    food = make_category("Food")
    rows = [make_row(food.id, 1_000, date(2026, 6, day)) for day in range(1, 8)]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    assert d3_leak(ledger) == []


def test_d4_recurring_new_and_price_change_flags():
    bills = make_category("Bills")
    rows = [
        # Series A: "netflix" note, existed since month-3, price rose 6% this month.
        make_row(bills.id, 500, date(2026, 3, 5), note="Netflix subscription"),
        make_row(bills.id, 500, date(2026, 4, 5), note="Netflix subscription"),
        make_row(bills.id, 500, date(2026, 5, 5), note="Netflix subscription"),
        make_row(bills.id, 530, date(2026, 6, 5), note="Netflix subscription"),
        # Series B: "spotify" note, only exists from month-2, so it's new this month.
        make_row(bills.id, 300, date(2026, 4, 6), note="Spotify subscription"),
        make_row(bills.id, 300, date(2026, 5, 6), note="Spotify subscription"),
        make_row(bills.id, 300, date(2026, 6, 6), note="Spotify subscription"),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [bills])

    candidates = d4_recurring(ledger)

    assert [c.subject for c in candidates] == ["Bills", "Bills"]
    netflix, spotify = candidates
    assert netflix.display == ["S$5.30", "S$8.30", "S$5.00"]  # latest, monthly_total, previous
    assert spotify.display == ["S$3.00", "S$8.30", "new"]


def test_d4_recurring_label_is_never_the_raw_note():
    bills = make_category("Bills")
    marker = "SECRET_NOTE_MARKER_TOKEN"
    rows = [make_row(bills.id, 500, date(2026, m, 5), note=marker) for m in (4, 5, 6)]
    ledger = make_ledger(CLOSED_MONTH, rows, [bills])
    candidates = d4_recurring(ledger)
    assert len(candidates) == 1
    assert marker not in candidates[0].subject
    assert all(marker not in token for token in candidates[0].display)


def test_d4_recurring_requires_three_consecutive_months():
    bills = make_category("Bills")
    rows = [
        make_row(bills.id, 500, date(2026, 5, 5), note="Netflix"),
        make_row(bills.id, 500, date(2026, 6, 5), note="Netflix"),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [bills])
    assert d4_recurring(ledger) == []


def test_d5_timing_weekend_share_hand_computed():
    food = make_category("Food")
    # 2026-06-06 and 2026-06-07 are a Saturday and Sunday.
    rows = [make_row(food.id, 5_000, date(2026, 6, 6)) for _ in range(4)]
    rows += [make_row(food.id, 5_000, date(2026, 6, 7)) for _ in range(4)]
    rows += [make_row(food.id, 100, date(2026, 6, 15))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d5_timing(ledger)
    assert len(candidates) == 1
    assert candidates[0].display == ["100%", "S$400.00"]


def test_d5_timing_early_month_share():
    food = make_category("Food")
    rows = [make_row(food.id, 4_500, date(2026, 6, d)) for d in (1, 2, 3)]
    rows += [make_row(food.id, 5_500, date(2026, 6, 20))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d5_timing(ledger)
    assert len(candidates) == 1
    assert candidates[0].display[0] == "71%"


def test_d6_trend_fires_on_consistent_rise():
    food = make_category("Food")
    rows = []
    for i, amount in enumerate([10_000, 12_000, 14_000, 20_000]):
        rows.append(make_row(food.id, amount, date(2026, 6 + i, 15)))
    ledger = make_ledger(date(2026, 9, 1), rows, [food])
    candidates = d6_trend(ledger)
    assert len(candidates) == 1
    assert candidates[0].subject == "Food"


def test_d6_trend_requires_all_four_months_of_data():
    food = make_category("Food")
    rows = [
        make_row(food.id, 10_000, date(2026, 7, 15)),
        make_row(food.id, 20_000, date(2026, 8, 15)),
        make_row(food.id, 30_000, date(2026, 9, 15)),
    ]
    ledger = make_ledger(date(2026, 9, 1), rows, [food])
    assert d6_trend(ledger) == []


def test_d7_budget_suggests_raise_when_over_for_three_months():
    budget = make_budget(50_000)
    rows = [make_row(None, 60_000, date(2026, 9 - i, 15)) for i in range(1, 4)]
    ledger = make_ledger(date(2026, 9, 1), rows, [], [budget])
    candidates = d7_budget(ledger)
    assert len(candidates) == 1
    assert candidates[0].proposal.rows[0].to_cents == 60_000


def test_d7_budget_suggests_lower_when_consistently_under():
    budget = make_budget(100_000)
    rows = [make_row(None, 60_000, date(2026, 9 - i, 15)) for i in range(1, 4)]
    ledger = make_ledger(date(2026, 9, 1), rows, [], [budget])
    candidates = d7_budget(ledger)
    assert len(candidates) == 1
    assert candidates[0].proposal.rows[0].to_cents == 60_000


def test_d8_anomaly_detects_duplicate():
    food = make_category("Food")
    rows = [
        make_row(food.id, 5_000, date(2026, 6, 10)),
        make_row(food.id, 5_000, date(2026, 6, 10)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d8_anomaly(ledger)
    assert any(c.subject.startswith("Duplicate") for c in candidates)
    assert any(c.display == ["S$50.00", "2"] for c in candidates)


def test_d8_anomaly_detects_outlier():
    food = make_category("Food")
    history = [make_row(food.id, 1_000, date(2026, 4, day)) for day in range(1, 6)]
    outlier = [make_row(food.id, 10_000, date(2026, 6, 10))]
    ledger = make_ledger(CLOSED_MONTH, history + outlier, [food])
    candidates = d8_anomaly(ledger)
    assert any(c.subject.startswith("Outlier") for c in candidates)


def test_d9_win_fires_on_three_month_decline():
    food = make_category("Food")
    rows = [
        make_row(food.id, 30_000, date(2026, 4, 15)),
        make_row(food.id, 20_000, date(2026, 5, 15)),
        make_row(food.id, 10_000, date(2026, 6, 15)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    candidates = d9_win(ledger)
    assert any(c.subject == "Food" for c in candidates)


def test_d9_win_fires_when_budget_kept_after_prior_overage():
    food = make_category("Food")
    budget = make_budget(10_000, category_id=food.id)
    rows = [
        make_row(food.id, 20_000, date(2026, 5, 10)),
        make_row(food.id, 5_000, date(2026, 6, 10)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food], [budget])
    candidates = d9_win(ledger)
    assert any("kept" in c.subject for c in candidates)


def test_d10_logging_flags_other_category_share():
    other = make_category("Other")
    rows = [make_row(other.id, 10_000, date(2026, 6, 10))]
    ledger = make_ledger(CLOSED_MONTH, rows, [other])
    candidates = d10_logging(ledger)
    assert any(
        c.subject == "Other category" and c.display == ["100%", "S$100.00"] for c in candidates
    )


def test_d10_logging_flags_a_gap_for_an_otherwise_active_user():
    other = make_category("Groceries")
    rows = []
    day = date(2026, 3, 3)
    while day < date(2026, 6, 1):
        rows.append(make_row(other.id, 500, day))
        day += timedelta(days=1)
    rows += [make_row(other.id, 1_000, date(2026, 6, 1))]
    rows += [make_row(other.id, 1_000, date(2026, 6, 20))]
    ledger = make_ledger(CLOSED_MONTH, rows, [other])
    candidates = d10_logging(ledger)
    assert any(c.kind == "logging" and "Gap" in c.subject for c in candidates)
