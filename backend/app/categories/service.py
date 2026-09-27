import uuid
from collections import defaultdict
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.budgets import service as budgets_service
from app.categories.models import Category
from app.categories.schemas import CategoryOut, CategoryTreeParams
from app.exceptions import (
    CategoryInUse,
    CategoryNotFound,
    DuplicateName,
    LimitReached,
    MaxDepthExceeded,
)
from app.expenses.models import Expense

TOP_LEVEL_LIMIT = 100
SUB_CATEGORY_LIMIT = 50


def _active(user_id: uuid.UUID) -> list:
    return [Category.user_id == user_id, Category.deleted_at.is_(None)]


def _same_level(parent_id: uuid.UUID | None):
    return Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id


def get_active_category(db: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
    stmt = select(Category).where(Category.id == category_id, *_active(user_id))
    return db.execute(stmt).scalar_one_or_none()


def _count_siblings(db: Session, user_id: uuid.UUID, parent_id: uuid.UUID | None) -> int:
    stmt = select(func.count()).where(*_active(user_id), _same_level(parent_id))
    return db.execute(stmt).scalar_one()


def _name_taken(
    db: Session, category_id: uuid.UUID | None, user_id: uuid.UUID, name: str, parent_id
) -> bool:
    stmt = select(Category.id).where(
        *_active(user_id), _same_level(parent_id), func.lower(Category.name) == name.lower()
    )
    return any(found_id != category_id for found_id in db.execute(stmt).scalars())


def _expense_counts(
    db: Session,
    user_id: uuid.UUID,
    column,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[uuid.UUID, int]:
    conditions = [Expense.user_id == user_id, Expense.deleted_at.is_(None), column.is_not(None)]
    if date_from:
        conditions.append(Expense.expense_date >= date_from)
    if date_to:
        conditions.append(Expense.expense_date <= date_to)
    stmt = select(column, func.count()).where(*conditions).group_by(column)
    return dict(db.execute(stmt).all())


def _commit_or_duplicate(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateName() from exc


def create_category(
    db: Session, user_id: uuid.UUID, name: str, parent_id: uuid.UUID | None
) -> Category:
    if parent_id is not None:
        parent = get_active_category(db, user_id, parent_id)
        if parent is None:
            raise CategoryNotFound("Parent category not found")
        if parent.parent_id is not None:
            raise MaxDepthExceeded()

    if _name_taken(db, None, user_id, name, parent_id):
        raise DuplicateName()

    limit = TOP_LEVEL_LIMIT if parent_id is None else SUB_CATEGORY_LIMIT
    if _count_siblings(db, user_id, parent_id) >= limit:
        raise LimitReached(f"Limit of {limit} reached")

    category = Category(user_id=user_id, name=name, parent_id=parent_id)
    db.add(category)
    _commit_or_duplicate(db)
    db.refresh(category)
    return category


def rename_category(db: Session, category: Category, name: str) -> Category:
    if _name_taken(db, category.id, category.user_id, name, category.parent_id):
        raise DuplicateName()

    category.name = name
    _commit_or_duplicate(db)
    db.refresh(category)
    return category


def delete_category(db: Session, user_id: uuid.UUID, category: Category) -> None:
    # A top-level category's expenses always carry its id in category_id, sub-category or not.
    column = Expense.category_id if category.parent_id is None else Expense.sub_category_id
    active_count = _expense_counts(db, user_id, column).get(category.id, 0)
    if active_count > 0:
        raise CategoryInUse(details={"active_expense_count": active_count})

    now = datetime.now(UTC)
    category.deleted_at = now
    if category.parent_id is None:
        children = select(Category).where(*_active(user_id), Category.parent_id == category.id)
        for child in db.execute(children).scalars():
            child.deleted_at = now

    budgets_service.soft_delete_budget_for_category(db, user_id, category.id)
    db.commit()


def get_category_tree(
    db: Session, user_id: uuid.UUID, params: CategoryTreeParams | None = None
) -> list[CategoryOut]:
    params = params or CategoryTreeParams()
    stmt = select(Category).where(*_active(user_id)).order_by(func.lower(Category.name))
    categories = list(db.execute(stmt).scalars())
    counts_range = (params.date_from, params.date_to)
    top_counts = _expense_counts(db, user_id, Expense.category_id, *counts_range)
    sub_counts = _expense_counts(db, user_id, Expense.sub_category_id, *counts_range)

    children: dict[uuid.UUID, list[CategoryOut]] = defaultdict(list)
    for sub in (c for c in categories if c.parent_id is not None):
        children[sub.parent_id].append(
            CategoryOut(
                id=sub.id,
                name=sub.name,
                parent_id=sub.parent_id,
                expense_count=sub_counts.get(sub.id, 0),
            )
        )

    return [
        CategoryOut(
            id=top.id,
            name=top.name,
            parent_id=None,
            expense_count=top_counts.get(top.id, 0),
            sub_categories=children[top.id],
        )
        for top in categories
        if top.parent_id is None
    ]
