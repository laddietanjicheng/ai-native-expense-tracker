def test_list_categories_returns_seeded_tree(client):
    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    names = [c["name"] for c in body["data"]]
    assert names == sorted(names, key=str.lower)
    food = next(c for c in body["data"] if c["name"] == "Food")
    assert food["parent_id"] is None
    assert food["expense_count"] == 0
    sub_names = [s["name"] for s in food["sub_categories"]]
    assert "Groceries" in sub_names
    other = next(c for c in body["data"] if c["name"] == "Other")
    assert other["sub_categories"] == []


def test_create_top_level_category(client):
    response = client.post("/api/v1/categories", json={"name": "Pets"})
    assert response.status_code == 201
    body = response.json()
    assert body["data"]["name"] == "Pets"
    assert body["data"]["parent_id"] is None


def test_create_sub_category(client, categories):
    food_id = str(categories["Food"].id)
    response = client.post("/api/v1/categories", json={"name": "Snacks 2", "parent_id": food_id})
    assert response.status_code == 201
    assert response.json()["data"]["parent_id"] == food_id


def test_create_category_trims_name(client):
    response = client.post("/api/v1/categories", json={"name": "  Trimmed  "})
    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Trimmed"


def test_create_category_duplicate_name_case_insensitive(client):
    response = client.post("/api/v1/categories", json={"name": "food"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_NAME"


def test_create_sub_category_duplicate_name_case_insensitive(client, categories):
    food_id = str(categories["Food"].id)
    response = client.post("/api/v1/categories", json={"name": "groceries", "parent_id": food_id})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_NAME"


def test_create_category_max_depth_exceeded(client, categories):
    groceries_id = str(categories["Groceries"].id)
    response = client.post("/api/v1/categories", json={"name": "Nested", "parent_id": groceries_id})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MAX_DEPTH_EXCEEDED"


def test_create_category_missing_parent_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = client.post("/api/v1/categories", json={"name": "Orphan", "parent_id": fake_id})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_create_category_validation_error_empty_name(client):
    response = client.post("/api/v1/categories", json={"name": "   "})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_category_top_level_limit_reached(client, db_session, user_id):
    from app.categories import service as categories_service

    for i in range(100 - 7):  # 7 already seeded top-level categories
        categories_service.create_category(db_session, user_id, f"Cat {i}", None)

    response = client.post("/api/v1/categories", json={"name": "One Too Many"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "LIMIT_REACHED"


def test_create_sub_category_limit_reached(client, db_session, user_id, categories):
    from app.categories import service as categories_service

    other_id = categories["Other"].id
    for i in range(50):
        categories_service.create_category(db_session, user_id, f"Sub {i}", other_id)

    response = client.post(
        "/api/v1/categories", json={"name": "One More Sub", "parent_id": str(other_id)}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "LIMIT_REACHED"


def test_rename_category(client, categories):
    food_id = str(categories["Food"].id)
    response = client.patch(f"/api/v1/categories/{food_id}", json={"name": "Food & Drink"})
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Food & Drink"


def test_rename_category_duplicate_name(client, categories):
    food_id = str(categories["Food"].id)
    response = client.patch(f"/api/v1/categories/{food_id}", json={"name": "transport"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_NAME"


def test_rename_category_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = client.patch(f"/api/v1/categories/{fake_id}", json={"name": "Whatever"})
    assert response.status_code == 404


def test_delete_category_without_expenses(client, categories):
    other_id = str(categories["Other"].id)
    response = client.delete(f"/api/v1/categories/{other_id}")
    assert response.status_code == 204

    list_response = client.get("/api/v1/categories")
    names = [c["name"] for c in list_response.json()["data"]]
    assert "Other" not in names


def test_delete_category_blocked_by_active_expenses(client, categories):
    food_id = str(categories["Food"].id)
    groceries_id = str(categories["Groceries"].id)
    client.post(
        "/api/v1/expenses",
        json={
            "amount_cents": 500,
            "expense_date": "2026-01-01",
            "category_id": food_id,
            "sub_category_id": groceries_id,
        },
    )

    response = client.delete(f"/api/v1/categories/{food_id}")
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "CATEGORY_IN_USE"
    assert body["error"]["details"]["active_expense_count"] == 1


def test_delete_sub_category_blocked_by_own_expenses_only(client, categories):
    food_id = str(categories["Food"].id)
    dining_id = str(categories["Dining Out"].id)
    client.post(
        "/api/v1/expenses",
        json={
            "amount_cents": 500,
            "expense_date": "2026-01-01",
            "category_id": food_id,
            "sub_category_id": dining_id,
        },
    )

    groceries_id = str(categories["Groceries"].id)
    response = client.delete(f"/api/v1/categories/{groceries_id}")
    assert response.status_code == 204


def test_delete_category_also_deletes_sub_categories(client, categories):
    entertainment_id = str(categories["Entertainment"].id)
    response = client.delete(f"/api/v1/categories/{entertainment_id}")
    assert response.status_code == 204

    list_response = client.get("/api/v1/categories")
    names = [c["name"] for c in list_response.json()["data"]]
    assert "Entertainment" not in names


def test_category_name_reusable_after_delete(client, categories):
    other_id = str(categories["Other"].id)
    delete_response = client.delete(f"/api/v1/categories/{other_id}")
    assert delete_response.status_code == 204

    recreate_response = client.post("/api/v1/categories", json={"name": "Other"})
    assert recreate_response.status_code == 201


def _add_expense(client, category, sub_category, expense_date):
    payload = {
        "amount_cents": 500,
        "expense_date": expense_date,
        "category_id": str(category.id),
        "sub_category_id": str(sub_category.id),
    }
    assert client.post("/api/v1/expenses", json=payload).status_code == 201


def test_list_categories_scopes_counts_to_date_range(client, categories):
    _add_expense(client, categories["Food"], categories["Groceries"], "2026-08-15")
    _add_expense(client, categories["Food"], categories["Groceries"], "2026-09-15")

    response = client.get(
        "/api/v1/categories", params={"date_from": "2026-09-01", "date_to": "2026-09-30"}
    )

    food = next(c for c in response.json()["data"] if c["name"] == "Food")
    groceries = next(s for s in food["sub_categories"] if s["name"] == "Groceries")
    assert (food["expense_count"], groceries["expense_count"]) == (1, 1)


def test_list_categories_counts_all_time_by_default(client, categories):
    _add_expense(client, categories["Food"], categories["Groceries"], "2020-01-01")

    food = next(c for c in client.get("/api/v1/categories").json()["data"] if c["name"] == "Food")

    assert food["expense_count"] == 1


def test_list_categories_rejects_inverted_range(client):
    response = client.get(
        "/api/v1/categories", params={"date_from": "2026-09-30", "date_to": "2026-09-01"}
    )

    assert response.status_code == 422
