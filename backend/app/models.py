"""Registers every ORM model so relationships and foreign keys resolve (app runtime and Alembic)."""

from app.budgets.models import Budget
from app.categories.models import Category
from app.chat.models import ChatTurn
from app.expenses.models import Expense
from app.insights.models import InsightGeneration, InsightReport
from app.users.models import User

__all__ = [
    "Budget",
    "Category",
    "ChatTurn",
    "Expense",
    "InsightGeneration",
    "InsightReport",
    "User",
]
