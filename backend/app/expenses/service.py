import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.categories import service as categories_service
from app.exceptions import CategoryNotFound, InvalidSubCategory
from app.expenses.models import Expense
from app.expenses.schemas import ExpenseCreate, ExpenseListParams, ExpenseOut, ExpenseUpdate

_WITH_CATEGORIES = (joinedload(Expense.category), joinedload(Expense.sub_category))


def _filter_conditions(user_id: uuid.UUID, params: ExpenseListParams) -> list:
    conditions = [Expense.user_id == user_id, Expense.deleted_at.is_(None)]
    if params.date_from:
        conditions.append(Expense.expense_date >= params.date_from)
    if params.date_to:
        conditions.append(Expense.expense_date <= params.date_to)
    if params.category_id:
        conditions.append(Expense.category_id.in_(params.category_id))
    if params.sub_category_id:
        conditions.append(Expense.sub_category_id == params.sub_category_id)
    return conditions


def get_active_expense(db: Session, user_id: uuid.UUID, expense_id: uuid.UUID) -> Expense | None:
    stmt = (
        select(Expense)
        .options(*_WITH_CATEGORIES)
        .where(Expense.id == expense_id, Expense.user_id == user_id, Expense.deleted_at.is_(None))
    )
    return db.execute(stmt).unique().scalar_one_or_none()


def _validate_categories(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID, sub_category_id: uuid.UUID | None
) -> None:
    category = categories_service.get_active_category(db, user_id, category_id)
    if category is None or category.parent_id is not None:
        raise CategoryNotFound()
    if sub_category_id is None:
        return
    sub_category = categories_service.get_active_category(db, user_id, sub_category_id)
    if sub_category is None or sub_category.parent_id != category_id:
        raise InvalidSubCategory()


def list_expenses(
    db: Session, user_id: uuid.UUID, params: ExpenseListParams
) -> tuple[list[ExpenseOut], dict[str, Any]]:
    conditions = _filter_conditions(user_id, params)
    sort_column = Expense.expense_date if params.sort == "date" else Expense.amount_cents
    order_by = sort_column.asc() if params.order == "asc" else sort_column.desc()

    items_stmt = (
        select(Expense)
        .options(*_WITH_CATEGORIES)
        .where(*conditions)
        .order_by(order_by, Expense.created_at.desc())
        .limit(params.page_size)
        .offset((params.page - 1) * params.page_size)
    )
    items = db.execute(items_stmt).unique().scalars().all()

    totals_stmt = select(
        func.count(),
        func.coalesce(func.sum(Expense.amount_cents), 0),
        func.count(func.distinct(Expense.category_id)),
    ).where(*conditions)
    total_count, total_amount_cents, category_count = db.execute(totals_stmt).one()

    meta = {
        "page": params.page,
        "page_size": params.page_size,
        "total_count": total_count,
        "total_amount_cents": int(total_amount_cents),
        "category_count": category_count,
    }
    return [ExpenseOut.model_validate(item) for item in items], meta


def create_expense(db: Session, user_id: uuid.UUID, payload: ExpenseCreate) -> Expense:
    _validate_categories(db, user_id, payload.category_id, payload.sub_category_id)
    expense = Expense(user_id=user_id, **payload.model_dump())
    db.add(expense)
    db.commit()
    return get_active_expense(db, user_id, expense.id)


def _resolve_sub_category(expense: Expense, updates: dict[str, Any]) -> uuid.UUID | None:
    if "sub_category_id" in updates:
        return updates["sub_category_id"]
    category_changed = updates.get("category_id", expense.category_id) != expense.category_id
    return None if category_changed else expense.sub_category_id


def update_expense(
    db: Session, user_id: uuid.UUID, expense: Expense, payload: ExpenseUpdate
) -> Expense:
    updates = payload.model_dump(exclude_unset=True)
    updates["sub_category_id"] = _resolve_sub_category(expense, updates)
    category_id = updates.get("category_id", expense.category_id)
    _validate_categories(db, user_id, category_id, updates["sub_category_id"])

    for field, value in updates.items():
        setattr(expense, field, value)
    db.commit()
    return get_active_expense(db, user_id, expense.id)


def delete_expense(db: Session, expense: Expense) -> None:
    expense.deleted_at = datetime.now(UTC)
    db.commit()
