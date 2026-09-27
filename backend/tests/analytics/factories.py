import uuid
from datetime import date, datetime

from core.analytics.models import BudgetInfo, CategoryInfo, ExpenseRow, Ledger
from core.dates import add_months


def make_category(name: str, parent_id: uuid.UUID | None = None) -> CategoryInfo:
    return CategoryInfo(id=uuid.uuid4(), parent_id=parent_id, name=name)


def make_row(
    category_id: uuid.UUID,
    amount_cents: int,
    expense_date: date,
    sub_category_id: uuid.UUID | None = None,
    note: str | None = None,
) -> ExpenseRow:
    return ExpenseRow(
        id=uuid.uuid4(),
        category_id=category_id,
        sub_category_id=sub_category_id,
        amount_cents=amount_cents,
        expense_date=expense_date,
        note=note,
        created_at=datetime.combine(expense_date, datetime.min.time()),
    )


def make_budget(amount_cents: int, category_id: uuid.UUID | None = None) -> BudgetInfo:
    return BudgetInfo(category_id=category_id, amount_cents=amount_cents)


def make_ledger(
    month: date,
    rows: list[ExpenseRow],
    categories: list[CategoryInfo],
    budgets: list[BudgetInfo] | None = None,
    today: date | None = None,
) -> Ledger:
    # Default "today" is two months after the ledger month, i.e. a closed month, unless a
    # test explicitly wants current-month behaviour (D1 pace, budget projections).
    return Ledger(
        month=month,
        today=today or add_months(month, 2),
        rows=rows,
        categories=categories,
        budgets=budgets or [],
    )
