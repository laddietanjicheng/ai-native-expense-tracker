from sqlalchemy import select

from app.budgets import service as budgets_service
from app.budgets.schemas import BudgetCategoryPut, BudgetPut
from app.categories.models import Category
from app.chat import service as chat_service
from core.agents.tool_loop import ProposalReady


def _handler(db_session, user_id):
    return chat_service._make_propose_budget_plan(db_session, user_id)


def test_rejects_foreign_category(db_session, categories, user_id, other_user):
    other_food = db_session.execute(
        select(Category).where(Category.user_id == other_user.id, Category.name == "Food")
    ).scalar_one()

    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": False,
            "rows": [{"category_id": str(other_food.id), "amount_cents": 10_000}],
        }
    )
    assert isinstance(result, str) and "active top-level categories" in result


def test_rejects_duplicate_category_id_rows(db_session, categories, user_id):
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": False,
            "rows": [
                {"category_id": str(categories["Food"].id), "amount_cents": 10_000},
                {"category_id": str(categories["Food"].id), "amount_cents": 20_000},
            ],
        }
    )
    assert isinstance(result, str) and "more than once" in result


def test_rejects_sub_category(db_session, categories, user_id):
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": False,
            "rows": [{"category_id": str(categories["Groceries"].id), "amount_cents": 10_000}],
        }
    )
    assert isinstance(result, str) and "active top-level categories" in result


def test_rejects_over_limit_amount(db_session, categories, user_id):
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": False,
            "rows": [{"category_id": str(categories["Food"].id), "amount_cents": 100_000_001}],
        }
    )
    assert isinstance(result, str) and "amount_cents" in result


def test_rejects_when_allocation_does_not_sum_exactly(db_session, categories, user_id):
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": True,
            "overall_cents": 100_000,
            "rows": [{"category_id": str(categories["Food"].id), "amount_cents": 50_000}],
        }
    )
    assert isinstance(result, str) and "must add up exactly" in result


def test_valid_allocation_returns_proposal_with_correct_from_cents(db_session, categories, user_id):
    budgets_service.replace_budgets(
        db_session,
        user_id,
        BudgetPut(
            categories=[BudgetCategoryPut(category_id=categories["Health"].id, amount_cents=20_000)]
        ),
    )

    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Trim spending",
            "allocates_overall": True,
            "overall_cents": 100_000,
            "rows": [
                {
                    "category_id": str(categories["Food"].id),
                    "amount_cents": 80_000,
                    "reason": "cut back",
                }
            ],
        }
    )

    assert isinstance(result, ProposalReady)
    proposal = result.proposal
    assert proposal["title"] == "Trim spending"
    assert proposal["footer"] == "Adds up to S$1,000.00"

    overall_row = next(r for r in proposal["rows"] if r["category_id"] is None)
    assert overall_row["from_cents"] is None
    assert overall_row["to_cents"] == 100_000

    food_row = next(r for r in proposal["rows"] if r["name"] == "Food")
    assert food_row["from_cents"] is None
    assert food_row["to_cents"] == 80_000
    assert food_row["reason"] == "cut back"


def test_valid_non_allocating_plan_has_empty_footer(db_session, categories, user_id):
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Just Health",
            "allocates_overall": False,
            "rows": [{"category_id": str(categories["Health"].id), "amount_cents": 15_000}],
        }
    )
    assert isinstance(result, ProposalReady)
    assert result.proposal["footer"] == ""


def test_existing_category_budget_counts_toward_allocation_check(db_session, categories, user_id):
    budgets_service.replace_budgets(
        db_session,
        user_id,
        BudgetPut(
            categories=[BudgetCategoryPut(category_id=categories["Health"].id, amount_cents=20_000)]
        ),
    )
    handler = _handler(db_session, user_id)
    result = handler(
        {
            "title": "Plan",
            "allocates_overall": True,
            "overall_cents": 100_000,
            "rows": [{"category_id": str(categories["Food"].id), "amount_cents": 80_000}],
        }
    )
    assert isinstance(result, ProposalReady)
