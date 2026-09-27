import uuid
from typing import Annotated

from pydantic import Field

from app.shared.schemas import CustomModel

MAX_AMOUNT_CENTS = 100_000_000

AmountCents = Annotated[int, Field(gt=0, le=MAX_AMOUNT_CENTS)]


class BudgetCategoryPut(CustomModel):
    category_id: uuid.UUID
    amount_cents: AmountCents


class BudgetPut(CustomModel):
    overall_cents: AmountCents | None = None
    categories: list[BudgetCategoryPut] = Field(default_factory=list)


class BudgetCategoryPatch(CustomModel):
    category_id: uuid.UUID
    amount_cents: AmountCents | None = None


class BudgetPatch(CustomModel):
    overall_cents: AmountCents | None = None
    categories: list[BudgetCategoryPatch] = Field(default_factory=list)


class BudgetRow(CustomModel):
    category_id: uuid.UUID
    name: str
    amount_cents: int | None
    avg3_cents: int


class BudgetsOut(CustomModel):
    overall_cents: int | None
    categories: list[BudgetRow]


class PreviousBudgets(CustomModel):
    overall_cents: int | None = None
    categories: list[BudgetCategoryPatch] = Field(default_factory=list)


class BudgetsPatchOut(CustomModel):
    overall_cents: int | None
    categories: list[BudgetRow]
    previous: PreviousBudgets
