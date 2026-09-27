import uuid
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.categories import service as categories_service
from app.categories.models import Category
from app.exceptions import CategoryNotFound, ExpenseNotFound
from app.expenses import service as expenses_service
from app.expenses.models import Expense
from core.database import get_db
from core.llm.base import LLMClient
from core.llm.factory import get_llm_client

DEFAULT_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def get_current_user_id() -> uuid.UUID:
    return DEFAULT_USER_ID


DbSession = Annotated[Session, Depends(get_db)]
CurrentUserId = Annotated[uuid.UUID, Depends(get_current_user_id)]


def valid_category_id(category_id: uuid.UUID, db: DbSession, user_id: CurrentUserId) -> Category:
    category = categories_service.get_active_category(db, user_id, category_id)
    if category is None:
        raise CategoryNotFound()
    return category


def valid_expense_id(expense_id: uuid.UUID, db: DbSession, user_id: CurrentUserId) -> Expense:
    expense = expenses_service.get_active_expense(db, user_id, expense_id)
    if expense is None:
        raise ExpenseNotFound()
    return expense


ValidCategory = Annotated[Category, Depends(valid_category_id)]
ValidExpense = Annotated[Expense, Depends(valid_expense_id)]
LLM = Annotated[LLMClient, Depends(get_llm_client)]
