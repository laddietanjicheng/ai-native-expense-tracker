from datetime import date

from sqlalchemy import func, select

from app.expenses.models import Expense
from app.seed_demo import EXPENSE_COUNT, seed_demo


def test_seed_demo_adds_expenses_once(db_session):
    assert seed_demo(db_session, today=date(2026, 9, 26)) == EXPENSE_COUNT
    assert seed_demo(db_session, today=date(2026, 9, 26)) == 0

    total = db_session.execute(select(func.count()).select_from(Expense)).scalar_one()
    assert total == EXPENSE_COUNT


def test_seed_demo_expenses_satisfy_api_rules(client, db_session):
    seed_demo(db_session, today=date(2026, 9, 26))

    response = client.get("/api/v1/expenses", params={"page_size": 100})

    assert response.status_code == 200
    assert response.json()["meta"]["total_count"] == EXPENSE_COUNT
