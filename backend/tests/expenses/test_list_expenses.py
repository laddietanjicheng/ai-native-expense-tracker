import pytest

URL = "/api/v1/expenses"


def _create(client, category, amount_cents, expense_date, sub_category=None):
    payload = {
        "amount_cents": amount_cents,
        "expense_date": expense_date,
        "category_id": str(category.id),
        "sub_category_id": str(sub_category.id) if sub_category else None,
    }
    response = client.post(URL, json=payload)
    assert response.status_code == 201
    return response.json()["data"]


@pytest.fixture
def sample(client, categories):
    food, transport = categories["Food"], categories["Transport"]
    return {
        "groceries": _create(client, food, 8645, "2026-09-25", categories["Groceries"]),
        "lunch": _create(client, food, 650, "2026-09-26", categories["Dining Out"]),
        "bus": _create(client, transport, 3000, "2026-08-10"),
    }


def _ids(response):
    return [item["id"] for item in response.json()["data"]]


def test_list_returns_meta_for_whole_filtered_set(client, sample):
    response = client.get(URL, params={"page_size": 1})

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["meta"] == {
        "page": 1,
        "page_size": 1,
        "total_count": 3,
        "total_amount_cents": 12295,
        "category_count": 2,
    }


def test_list_defaults_to_newest_first(client, sample):
    assert _ids(client.get(URL)) == [
        sample["lunch"]["id"],
        sample["groceries"]["id"],
        sample["bus"]["id"],
    ]


def test_list_sorts_by_amount_ascending(client, sample):
    response = client.get(URL, params={"sort": "amount", "order": "asc"})

    assert _ids(response) == [sample["lunch"]["id"], sample["bus"]["id"], sample["groceries"]["id"]]


def test_list_filters_by_inclusive_date_range(client, sample):
    response = client.get(URL, params={"date_from": "2026-09-01", "date_to": "2026-09-25"})

    assert _ids(response) == [sample["groceries"]["id"]]


def test_list_parent_category_filter_includes_sub_categories(client, sample, categories):
    response = client.get(URL, params={"category_id": str(categories["Food"].id)})

    assert set(_ids(response)) == {sample["groceries"]["id"], sample["lunch"]["id"]}


def test_list_filters_by_multiple_categories(client, sample, categories):
    params = [("category_id", str(categories[name].id)) for name in ("Food", "Transport")]

    assert len(_ids(client.get(URL, params=params))) == 3


def test_list_filters_by_sub_category(client, sample, categories):
    response = client.get(URL, params={"sub_category_id": str(categories["Dining Out"].id)})

    assert _ids(response) == [sample["lunch"]["id"]]


def test_list_paginates(client, sample):
    response = client.get(URL, params={"page": 2, "page_size": 2})

    assert _ids(response) == [sample["bus"]["id"]]


def test_list_excludes_deleted_expenses(client, sample):
    client.delete(f"{URL}/{sample['bus']['id']}")

    response = client.get(URL)

    assert sample["bus"]["id"] not in _ids(response)
    assert response.json()["meta"]["total_amount_cents"] == 9295


def test_list_empty_result_has_zero_totals(client, sample):
    response = client.get(URL, params={"date_from": "2020-01-01", "date_to": "2020-01-31"})

    assert response.json()["data"] == []
    assert response.json()["meta"]["total_amount_cents"] == 0


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-09-30", "date_to": "2026-09-01"},
        {"page": 0},
        {"page_size": 101},
        {"sort": "note"},
    ],
)
def test_list_rejects_invalid_params(client, params):
    response = client.get(URL, params=params)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
