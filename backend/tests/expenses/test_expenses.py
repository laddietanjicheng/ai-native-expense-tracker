import pytest


def _create_expense(
    client, category_id, sub_category_id=None, amount_cents=1000, date="2026-01-15", note=None
):
    payload = {
        "amount_cents": amount_cents,
        "expense_date": date,
        "category_id": category_id,
    }
    if sub_category_id is not None:
        payload["sub_category_id"] = sub_category_id
    if note is not None:
        payload["note"] = note
    return client.post("/api/v1/expenses", json=payload)


def test_create_expense_happy_path(client, categories):
    food_id = str(categories["Food"].id)
    groceries_id = str(categories["Groceries"].id)
    response = _create_expense(client, food_id, groceries_id, note="Weekly shop")
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["amount_cents"] == 1000
    assert body["category"]["id"] == food_id
    assert body["sub_category"]["id"] == groceries_id
    assert body["note"] == "Weekly shop"


def test_create_expense_without_sub_category(client, categories):
    food_id = str(categories["Food"].id)
    response = _create_expense(client, food_id)
    assert response.status_code == 201
    assert response.json()["data"]["sub_category"] is None


def test_create_expense_invalid_amount(client, categories):
    food_id = str(categories["Food"].id)
    response = _create_expense(client, food_id, amount_cents=0)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_expense_amount_too_large(client, categories):
    food_id = str(categories["Food"].id)
    response = _create_expense(client, food_id, amount_cents=100_000_001)
    assert response.status_code == 422


def test_create_expense_note_too_long(client, categories):
    food_id = str(categories["Food"].id)
    response = _create_expense(client, food_id, note="x" * 501)
    assert response.status_code == 422


def test_create_expense_category_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = _create_expense(client, fake_id)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_create_expense_category_must_be_top_level(client, categories):
    groceries_id = str(categories["Groceries"].id)
    response = _create_expense(client, groceries_id)
    assert response.status_code == 404


def test_create_expense_invalid_sub_category_wrong_parent(client, categories):
    food_id = str(categories["Food"].id)
    taxi_id = str(categories["Taxi & Ride-hailing"].id)
    response = _create_expense(client, food_id, taxi_id)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_SUB_CATEGORY"


def test_get_expense(client, categories):
    food_id = str(categories["Food"].id)
    created = _create_expense(client, food_id).json()["data"]
    response = client.get(f"/api/v1/expenses/{created['id']}")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == created["id"]


def test_get_expense_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = client.get(f"/api/v1/expenses/{fake_id}")
    assert response.status_code == 404


def test_update_expense_partial(client, categories):
    food_id = str(categories["Food"].id)
    created = _create_expense(client, food_id, amount_cents=500).json()["data"]
    response = client.patch(f"/api/v1/expenses/{created['id']}", json={"amount_cents": 999})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["amount_cents"] == 999
    assert body["category"]["id"] == food_id


def test_update_expense_clears_incompatible_sub_category(client, categories):
    food_id = str(categories["Food"].id)
    groceries_id = str(categories["Groceries"].id)
    transport_id = str(categories["Transport"].id)
    created = _create_expense(client, food_id, groceries_id).json()["data"]

    response = client.patch(f"/api/v1/expenses/{created['id']}", json={"category_id": transport_id})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["category"]["id"] == transport_id
    assert body["sub_category"] is None


def test_update_expense_new_category_with_new_sub_category(client, categories):
    food_id = str(categories["Food"].id)
    groceries_id = str(categories["Groceries"].id)
    transport_id = str(categories["Transport"].id)
    taxi_id = str(categories["Taxi & Ride-hailing"].id)
    created = _create_expense(client, food_id, groceries_id).json()["data"]

    response = client.patch(
        f"/api/v1/expenses/{created['id']}",
        json={"category_id": transport_id, "sub_category_id": taxi_id},
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["category"]["id"] == transport_id
    assert body["sub_category"]["id"] == taxi_id


def test_update_expense_invalid_sub_category(client, categories):
    food_id = str(categories["Food"].id)
    taxi_id = str(categories["Taxi & Ride-hailing"].id)
    created = _create_expense(client, food_id).json()["data"]

    response = client.patch(f"/api/v1/expenses/{created['id']}", json={"sub_category_id": taxi_id})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_SUB_CATEGORY"


def test_update_expense_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = client.patch(f"/api/v1/expenses/{fake_id}", json={"amount_cents": 100})
    assert response.status_code == 404


def test_delete_expense_soft_deletes_and_hides(client, categories):
    food_id = str(categories["Food"].id)
    created = _create_expense(client, food_id).json()["data"]

    delete_response = client.delete(f"/api/v1/expenses/{created['id']}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/api/v1/expenses/{created['id']}")
    assert get_response.status_code == 404

    list_response = client.get("/api/v1/expenses")
    ids = [item["id"] for item in list_response.json()["data"]]
    assert created["id"] not in ids


def test_delete_expense_not_found(client):
    fake_id = "00000000-0000-0000-0000-000000009999"
    response = client.delete(f"/api/v1/expenses/{fake_id}")
    assert response.status_code == 404


@pytest.mark.parametrize("field", ["amount_cents", "expense_date", "category_id"])
def test_update_expense_rejects_null_required_field(client, categories, field):
    created = _create_expense(client, str(categories["Food"].id)).json()["data"]
    response = client.patch(f"/api/v1/expenses/{created['id']}", json={field: None})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_update_expense_keeps_sub_category_when_category_unchanged(client, categories):
    food_id = str(categories["Food"].id)
    groceries_id = str(categories["Groceries"].id)
    created = _create_expense(client, food_id, groceries_id).json()["data"]

    response = client.patch(f"/api/v1/expenses/{created['id']}", json={"note": "Updated"})
    assert response.json()["data"]["sub_category"]["id"] == groceries_id
