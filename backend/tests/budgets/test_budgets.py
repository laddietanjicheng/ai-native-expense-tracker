from datetime import date

import pytest

from app.budgets.models import Budget
from app.exceptions import InvalidBudgetPlan
from app.expenses.models import Expense


def test_get_budgets_returns_row_per_active_top_level_category(client, categories):
    response = client.get("/api/v1/budgets")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["overall_cents"] is None
    names = {row["name"] for row in body["categories"]}
    assert "Food" in names
    assert all(row["amount_cents"] is None for row in body["categories"])
    assert all(row["avg3_cents"] == 0 for row in body["categories"])


def test_put_budgets_sets_overall_and_category(client, categories):
    food_id = str(categories["Food"].id)
    response = client.put(
        "/api/v1/budgets",
        json={
            "overall_cents": 100_000,
            "categories": [{"category_id": food_id, "amount_cents": 30_000}],
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["overall_cents"] == 100_000
    food_row = next(r for r in body["categories"] if r["category_id"] == food_id)
    assert food_row["amount_cents"] == 30_000


def test_put_budgets_replaces_existing_set(client, categories):
    food_id = str(categories["Food"].id)
    transport_id = str(categories["Transport"].id)
    client.put(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": 30_000}]}
    )

    response = client.put(
        "/api/v1/budgets",
        json={"categories": [{"category_id": transport_id, "amount_cents": 20_000}]},
    )
    body = response.json()["data"]
    food_row = next(r for r in body["categories"] if r["category_id"] == food_id)
    transport_row = next(r for r in body["categories"] if r["category_id"] == transport_id)
    assert food_row["amount_cents"] is None
    assert transport_row["amount_cents"] == 20_000


def test_put_budgets_unknown_category_is_rejected(client):
    response = client.put(
        "/api/v1/budgets",
        json={
            "categories": [
                {"category_id": "00000000-0000-0000-0000-000000009999", "amount_cents": 1_000}
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_BUDGET_PLAN"


def test_put_budgets_rejects_sub_category(client, categories):
    groceries_id = str(categories["Groceries"].id)
    response = client.put(
        "/api/v1/budgets",
        json={"categories": [{"category_id": groceries_id, "amount_cents": 1_000}]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_BUDGET_PLAN"


def test_patch_budgets_only_touches_listed_fields(client, categories):
    food_id = str(categories["Food"].id)
    transport_id = str(categories["Transport"].id)
    client.put(
        "/api/v1/budgets",
        json={
            "overall_cents": 100_000,
            "categories": [
                {"category_id": food_id, "amount_cents": 30_000},
                {"category_id": transport_id, "amount_cents": 20_000},
            ],
        },
    )

    response = client.patch(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": 40_000}]}
    )
    body = response.json()["data"]
    assert body["overall_cents"] == 100_000
    food_row = next(r for r in body["categories"] if r["category_id"] == food_id)
    transport_row = next(r for r in body["categories"] if r["category_id"] == transport_id)
    assert food_row["amount_cents"] == 40_000
    assert transport_row["amount_cents"] == 20_000


def test_patch_budgets_null_removes_budget(client, categories):
    food_id = str(categories["Food"].id)
    client.put(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": 30_000}]}
    )

    response = client.patch(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": None}]}
    )
    body = response.json()["data"]
    food_row = next(r for r in body["categories"] if r["category_id"] == food_id)
    assert food_row["amount_cents"] is None


def test_patch_budgets_returns_previous_for_undo(client, categories):
    food_id = str(categories["Food"].id)
    client.put(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": 30_000}]}
    )

    response = client.patch(
        "/api/v1/budgets", json={"categories": [{"category_id": food_id, "amount_cents": 45_000}]}
    )
    previous = response.json()["data"]["previous"]
    assert previous["categories"][0]["amount_cents"] == 30_000

    undo = client.patch("/api/v1/budgets", json=previous)
    food_row = next(r for r in undo.json()["data"]["categories"] if r["category_id"] == food_id)
    assert food_row["amount_cents"] == 30_000


def test_avg3_cents_hint_reflects_last_three_closed_months(client, db_session, categories, user_id):
    food = categories["Food"]
    for month, amount in [(6, 10_000), (7, 20_000), (8, 30_000), (9, 99_999)]:
        db_session.add(
            Expense(
                user_id=user_id,
                category_id=food.id,
                amount_cents=amount,
                expense_date=date(2026, month, 15),
            )
        )
    db_session.commit()

    response = client.get("/api/v1/budgets")
    food_row = next(r for r in response.json()["data"]["categories"] if r["name"] == "Food")
    assert food_row["avg3_cents"] == round((10_000 + 20_000 + 30_000) / 3)


def test_deleting_category_soft_deletes_its_budget(client, categories):
    pets_response = client.post("/api/v1/categories", json={"name": "Solo Category"})
    category_id = pets_response.json()["data"]["id"]
    client.put(
        "/api/v1/budgets",
        json={"categories": [{"category_id": category_id, "amount_cents": 5_000}]},
    )

    delete_response = client.delete(f"/api/v1/categories/{category_id}")
    assert delete_response.status_code == 204

    budgets = client.get("/api/v1/budgets").json()["data"]["categories"]
    assert all(row["category_id"] != category_id for row in budgets)


def test_concurrent_insert_raises_invalid_budget_plan_not_a_raw_db_error(
    db_session, categories, user_id
):
    from app.budgets import service as budgets_service

    food = categories["Food"]
    # Simulate two concurrent requests both passing the "no active budget yet" check and then
    # both inserting: the partial unique index rejects the second at commit time.
    db_session.add(Budget(user_id=user_id, category_id=food.id, amount_cents=1_000))
    db_session.flush()
    db_session.add(Budget(user_id=user_id, category_id=food.id, amount_cents=2_000))

    with pytest.raises(InvalidBudgetPlan):
        budgets_service._commit_or_conflict(db_session)
