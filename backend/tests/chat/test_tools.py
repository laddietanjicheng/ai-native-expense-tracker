import json
from datetime import date

from app.chat import service as chat_service
from app.expenses.models import Expense


def _add_expense(db_session, user_id, category, amount_cents, expense_date, sub=None, note=None):
    db_session.add(
        Expense(
            user_id=user_id,
            category_id=category.id,
            sub_category_id=sub.id if sub else None,
            amount_cents=amount_cents,
            expense_date=expense_date,
            note=note,
        )
    )
    db_session.commit()


MARKER = "SUPER_SECRET_NOTE_MARKER"


def test_get_month_summary_scopes_to_user_and_hides_notes(
    db_session, categories, user_id, other_user
):
    _add_expense(db_session, user_id, categories["Other"], 10_000, date(2026, 6, 10), note=MARKER)
    _add_expense(db_session, other_user.id, categories["Other"], 999_999, date(2026, 6, 10))

    handler = chat_service._make_get_month_summary(db_session, user_id)
    result = handler({"month": "2026-06"})

    assert result["total"]["cents"] == 10_000
    assert MARKER not in json.dumps(result)


def test_get_month_summary_formats_percentages_not_ratios(db_session, categories, user_id):
    # summary.delta_vs_prev_pct / delta_vs_avg3_pct are already percentages (32.0 for +32%), not
    # 0-1 ratios; the payload must show "32%", not "3200%".
    _add_expense(db_session, user_id, categories["Food"], 13_200, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Food"], 10_000, date(2026, 5, 10))
    _add_expense(db_session, user_id, categories["Food"], 10_000, date(2026, 4, 10))
    _add_expense(db_session, user_id, categories["Food"], 10_000, date(2026, 3, 10))

    handler = chat_service._make_get_month_summary(db_session, user_id)
    result = handler({"month": "2026-06"})

    assert result["delta_vs_prev_pct"] == "32%"
    assert result["delta_vs_avg3_pct"] == "32%"


def test_get_month_summary_rejects_bad_month():
    handler = chat_service._make_get_month_summary(None, None)
    assert handler({}).startswith("Error")
    assert handler({"month": "not-a-month"}).startswith("Error")


def test_get_category_breakdown_filters_by_category_and_hides_notes(
    db_session, categories, user_id
):
    _add_expense(db_session, user_id, categories["Food"], 5_000, date(2026, 6, 5), note=MARKER)
    _add_expense(db_session, user_id, categories["Other"], 1_000, date(2026, 6, 6), note=MARKER)

    handler = chat_service._make_get_category_breakdown(db_session, user_id)
    result = handler({"month": "2026-06", "category_id": str(categories["Food"].id)})

    assert len(result["categories"]) == 1
    assert result["categories"][0]["name"] == "Food"
    assert MARKER not in json.dumps(result)


def test_get_category_breakdown_unknown_category_is_an_error(db_session, categories, user_id):
    handler = chat_service._make_get_category_breakdown(db_session, user_id)
    result = handler({"month": "2026-06", "category_id": "11111111-1111-1111-1111-111111111111"})
    assert isinstance(result, str) and result.startswith("Error")


def test_compare_periods_scopes_to_user(db_session, categories, user_id, other_user):
    _add_expense(db_session, user_id, categories["Food"], 3_000, date(2026, 6, 5))
    _add_expense(db_session, user_id, categories["Food"], 5_000, date(2026, 5, 5))
    _add_expense(db_session, other_user.id, categories["Food"], 999_999, date(2026, 6, 5))

    handler = chat_service._make_compare_periods(db_session, user_id)
    result = handler(
        {
            "a_from": "2026-05-01",
            "a_to": "2026-05-31",
            "b_from": "2026-06-01",
            "b_to": "2026-06-30",
        }
    )
    row = next(r for r in result["categories"] if r["name"] == "Food")
    assert row["period_a"]["cents"] == 5_000
    assert row["period_b"]["cents"] == 3_000
    assert row["delta"]["cents"] == -2_000


def test_compare_periods_rejects_bad_range():
    handler = chat_service._make_compare_periods(None, None)
    result = handler({"a_from": "2026-06-05", "a_to": "2026-06-01", "b_from": "x", "b_to": "y"})
    assert result.startswith("Error")


def test_compare_periods_rejects_range_over_366_days():
    handler = chat_service._make_compare_periods(None, None)
    result = handler(
        {
            "a_from": "2020-01-01",
            "a_to": "2022-01-01",
            "b_from": "2026-01-01",
            "b_to": "2026-01-31",
        }
    )
    assert isinstance(result, str) and "366 days" in result


def test_list_expenses_never_returns_notes_and_scopes_to_user(
    db_session, categories, user_id, other_user
):
    _add_expense(db_session, user_id, categories["Food"], 1_200, date(2026, 6, 5), note=MARKER)
    _add_expense(
        db_session, other_user.id, categories["Food"], 999_999, date(2026, 6, 5), note=MARKER
    )

    handler = chat_service._make_list_expenses(db_session, user_id)
    result = handler({"date_from": "2026-06-01", "date_to": "2026-06-30"})

    assert len(result["expenses"]) == 1
    assert result["expenses"][0]["amount"]["cents"] == 1_200
    assert "note" not in result["expenses"][0]
    assert MARKER not in json.dumps(result)


def test_list_expenses_limit_is_capped_at_50(db_session, categories, user_id):
    for day in range(1, 11):
        _add_expense(db_session, user_id, categories["Other"], 100, date(2026, 6, day))

    handler = chat_service._make_list_expenses(db_session, user_id)
    result = handler({"date_from": "2026-06-01", "date_to": "2026-06-30", "limit": 999})
    assert len(result["expenses"]) == 10  # capped request still bound by actual rows

    handler_small = chat_service._make_list_expenses(db_session, user_id)
    small_result = handler_small({"date_from": "2026-06-01", "date_to": "2026-06-30", "limit": 3})
    assert len(small_result["expenses"]) == 3


def test_list_expenses_rejects_bad_dates():
    handler = chat_service._make_list_expenses(None, None)
    assert handler({"date_from": "bad", "date_to": "2026-06-01"}).startswith("Error")


def test_get_budgets_includes_progress_and_status(db_session, categories, user_id):
    from app.budgets import service as budgets_service
    from app.budgets.schemas import BudgetCategoryPut, BudgetPut

    budgets_service.replace_budgets(
        db_session,
        user_id,
        BudgetPut(
            categories=[BudgetCategoryPut(category_id=categories["Food"].id, amount_cents=10_000)]
        ),
    )
    _add_expense(db_session, user_id, categories["Food"], 12_000, date.today().replace(day=1))

    handler = chat_service._make_get_budgets(db_session, user_id)
    result = handler({})
    food_row = next(r for r in result["categories"] if r["name"] == "Food")
    assert food_row["status"] == "Over"


def test_get_insights_never_returns_notes(db_session, categories, user_id):
    _add_expense(db_session, user_id, categories["Food"], 3_000, date(2026, 5, 10), note=MARKER)
    _add_expense(db_session, user_id, categories["Food"], 12_000, date(2026, 6, 10), note=MARKER)

    handler = chat_service._make_get_insights(db_session, user_id)
    result = handler({"month": "2026-06"})
    assert MARKER not in json.dumps(result)
