from datetime import date

from app.insights import service
from tests.analytics.factories import make_budget, make_category, make_ledger, make_row

CURRENT_MONTH = date(2026, 9, 1)
CLOSED_MONTH = date(2026, 6, 1)


def test_build_changes_includes_sub_category_rows():
    food = make_category("Food")
    dining = make_category("Dining Out", parent_id=food.id)
    rows = [
        make_row(food.id, 5_000, date(2026, 6, 5), sub_category_id=dining.id),
        make_row(food.id, 3_000, date(2026, 5, 5), sub_category_id=dining.id),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food, dining])
    changes = service.build_changes(ledger)
    assert changes[0].name == "Food"
    assert changes[0].sub_categories[0].name == "Dining Out"
    assert changes[0].sub_categories[0].delta_cents == 2_000


def test_budget_progress_over_status():
    food = make_category("Food")
    budget = make_budget(1_000, category_id=food.id)
    rows = [make_row(food.id, 5_000, date(2026, 6, 10))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food], [budget])
    progress = service.build_budget_progress(ledger)
    assert progress[0].status == "Over"
    assert progress[0].projected_cents is None


def test_budget_progress_at_risk_for_current_month():
    food = make_category("Food")
    budget = make_budget(50_000, category_id=food.id)
    rows = [make_row(food.id, 46_000, date(2026, 9, 3))]
    ledger = make_ledger(CURRENT_MONTH, rows, [food], [budget], today=date(2026, 9, 26))
    progress = service.build_budget_progress(ledger)
    # spent 46_000, 26/30 days elapsed -> projected ~53_077, over the 50_000 cap but not yet spent
    assert progress[0].projected_cents == 53_077
    assert progress[0].status == "At risk"


def test_budget_progress_on_track():
    food = make_category("Food")
    budget = make_budget(1_000_000, category_id=food.id)
    rows = [make_row(food.id, 1_000, date(2026, 6, 10))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food], [budget])
    progress = service.build_budget_progress(ledger)
    assert progress[0].status == "On track"


def test_summary_projects_for_current_month():
    food = make_category("Food")
    rows = [make_row(food.id, 10_000, date(2026, 9, 1))]
    ledger = make_ledger(CURRENT_MONTH, rows, [food], today=date(2026, 9, 26))
    summary = service.build_summary(ledger)
    assert summary.projected_cents is not None
    assert summary.days_elapsed == 26


def test_summary_has_no_projection_for_closed_month():
    food = make_category("Food")
    rows = [make_row(food.id, 10_000, date(2026, 6, 1))]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    summary = service.build_summary(ledger)
    assert summary.projected_cents is None


def test_load_ledger_uses_sgt_today_not_wall_clock_utc(
    monkeypatch, db_session, categories, user_id
):
    # 00:30 SGT on the 1st of the month is still 16:30 UTC the previous day; days_elapsed must
    # read 1 (SGT), not 0 or 30 (UTC).
    monkeypatch.setattr(service, "today_sgt", lambda: date(2026, 7, 1))
    ledger = service.load_ledger(db_session, user_id, date(2026, 7, 1))
    assert ledger.today == date(2026, 7, 1)
    assert ledger.is_current_month is True
    assert ledger.days_elapsed == 1


def test_summary_deltas_are_percentages_like_budget_pct():
    food = make_category("Food")
    rows = [
        make_row(food.id, 13_200, date(2026, 6, 10)),
        make_row(food.id, 10_000, date(2026, 5, 10)),
        make_row(food.id, 10_000, date(2026, 4, 10)),
        make_row(food.id, 10_000, date(2026, 3, 10)),
    ]
    ledger = make_ledger(CLOSED_MONTH, rows, [food])
    summary = service.build_summary(ledger)
    assert summary.delta_vs_prev_pct == 32.0
    assert summary.delta_vs_avg3_pct == 32.0
