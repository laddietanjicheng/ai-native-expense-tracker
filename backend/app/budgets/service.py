import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.budgets.models import Budget
from app.budgets.schemas import (
    BudgetPatch,
    BudgetPut,
    BudgetRow,
    BudgetsOut,
    BudgetsPatchOut,
    PreviousBudgets,
)
from app.categories.models import Category
from app.exceptions import InvalidBudgetPlan
from app.expenses.models import Expense
from app.shared.dates import add_months, month_end, month_start, today_sgt

AVG3_MONTHS_BACK = (1, 2, 3)


def active_top_level_categories(db: Session, user_id: uuid.UUID) -> list[Category]:
    stmt = select(Category).where(
        Category.user_id == user_id,
        Category.parent_id.is_(None),
        Category.deleted_at.is_(None),
    )
    return list(db.execute(stmt).scalars())


def _month_total_cents(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID | None, month: date
) -> int:
    conditions = [
        Expense.user_id == user_id,
        Expense.deleted_at.is_(None),
        Expense.expense_date >= month_start(month),
        Expense.expense_date <= month_end(month),
    ]
    if category_id is not None:
        conditions.append(Expense.category_id == category_id)
    stmt = select(func.coalesce(func.sum(Expense.amount_cents), 0)).where(*conditions)
    return int(db.execute(stmt).scalar_one())


def avg3_cents(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID | None, reference_month: date
) -> int:
    """Mean of the 3 closed months before `reference_month`."""
    totals = [
        _month_total_cents(db, user_id, category_id, add_months(month_start(reference_month), -i))
        for i in AVG3_MONTHS_BACK
    ]
    return round(sum(totals) / len(totals))


def active_budget(db: Session, user_id: uuid.UUID, category_id: uuid.UUID | None) -> Budget | None:
    conditions = [
        Budget.user_id == user_id,
        Budget.deleted_at.is_(None),
        Budget.category_id.is_(None) if category_id is None else Budget.category_id == category_id,
    ]
    stmt = select(Budget).where(*conditions)
    return db.execute(stmt).scalar_one_or_none()


def _set_budget(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID | None, amount_cents: int
) -> None:
    budget = active_budget(db, user_id, category_id)
    if budget is None:
        db.add(Budget(user_id=user_id, category_id=category_id, amount_cents=amount_cents))
    else:
        budget.amount_cents = amount_cents


def _remove_budget(db: Session, user_id: uuid.UUID, category_id: uuid.UUID | None) -> None:
    budget = active_budget(db, user_id, category_id)
    if budget is not None:
        budget.deleted_at = datetime.now(UTC)


def _validate_category_ids(categories: list[Category], category_ids: set[uuid.UUID]) -> None:
    valid_ids = {c.id for c in categories}
    unknown = category_ids - valid_ids
    if unknown:
        raise InvalidBudgetPlan(details={"unknown_category_ids": [str(cid) for cid in unknown]})


def _commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise InvalidBudgetPlan("A budget for that category already exists") from exc


def build_budgets_out(db: Session, user_id: uuid.UUID) -> BudgetsOut:
    reference_month = today_sgt()
    categories = active_top_level_categories(db, user_id)
    overall_budget = active_budget(db, user_id, None)

    rows = []
    for category in sorted(categories, key=lambda c: c.name.lower()):
        budget = active_budget(db, user_id, category.id)
        rows.append(
            BudgetRow(
                category_id=category.id,
                name=category.name,
                amount_cents=budget.amount_cents if budget else None,
                avg3_cents=avg3_cents(db, user_id, category.id, reference_month),
            )
        )
    return BudgetsOut(
        overall_cents=overall_budget.amount_cents if overall_budget else None,
        categories=rows,
    )


def get_budgets(db: Session, user_id: uuid.UUID) -> BudgetsOut:
    return build_budgets_out(db, user_id)


def replace_budgets(db: Session, user_id: uuid.UUID, payload: BudgetPut) -> BudgetsOut:
    categories = active_top_level_categories(db, user_id)
    requested_ids = {row.category_id for row in payload.categories}
    _validate_category_ids(categories, requested_ids)

    if payload.overall_cents is None:
        _remove_budget(db, user_id, None)
    else:
        _set_budget(db, user_id, None, payload.overall_cents)

    for category in categories:
        if category.id not in requested_ids:
            _remove_budget(db, user_id, category.id)
    for row in payload.categories:
        _set_budget(db, user_id, row.category_id, row.amount_cents)

    _commit_or_conflict(db)
    return build_budgets_out(db, user_id)


def patch_budgets(db: Session, user_id: uuid.UUID, payload: BudgetPatch) -> BudgetsPatchOut:
    categories = active_top_level_categories(db, user_id)
    requested_ids = {row.category_id for row in payload.categories}
    _validate_category_ids(categories, requested_ids)

    previous = PreviousBudgets()
    if "overall_cents" in payload.model_fields_set:
        overall_budget = active_budget(db, user_id, None)
        previous.overall_cents = overall_budget.amount_cents if overall_budget else None
        if payload.overall_cents is None:
            _remove_budget(db, user_id, None)
        else:
            _set_budget(db, user_id, None, payload.overall_cents)

    for row in payload.categories:
        existing = active_budget(db, user_id, row.category_id)
        previous.categories.append(
            type(row)(
                category_id=row.category_id,
                amount_cents=existing.amount_cents if existing else None,
            )
        )
        if row.amount_cents is None:
            _remove_budget(db, user_id, row.category_id)
        else:
            _set_budget(db, user_id, row.category_id, row.amount_cents)

    _commit_or_conflict(db)
    new_state = build_budgets_out(db, user_id)
    return BudgetsPatchOut(
        overall_cents=new_state.overall_cents, categories=new_state.categories, previous=previous
    )


def soft_delete_budget_for_category(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID
) -> None:
    _remove_budget(db, user_id, category_id)
