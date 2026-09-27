import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, model_validator

from app.shared.pagination import PageParams
from app.shared.schemas import CustomModel

MAX_AMOUNT_CENTS = 100_000_000
MAX_NOTE_LENGTH = 500

AmountCents = Annotated[int, Field(gt=0, le=MAX_AMOUNT_CENTS)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_NOTE_LENGTH)]

REQUIRED_FIELDS = ("amount_cents", "expense_date", "category_id")


class CategoryRef(CustomModel):
    id: uuid.UUID
    name: str


class ExpenseCreate(CustomModel):
    amount_cents: AmountCents
    expense_date: date
    category_id: uuid.UUID
    sub_category_id: uuid.UUID | None = None
    note: Note | None = None


class ExpenseUpdate(CustomModel):
    amount_cents: AmountCents | None = None
    expense_date: date | None = None
    category_id: uuid.UUID | None = None
    sub_category_id: uuid.UUID | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def required_fields_not_null(self) -> Self:
        nulled = [
            f for f in REQUIRED_FIELDS if f in self.model_fields_set and getattr(self, f) is None
        ]
        if nulled:
            raise ValueError(f"{', '.join(nulled)} cannot be null")
        return self


class ExpenseOut(CustomModel):
    id: uuid.UUID
    amount_cents: int
    expense_date: date
    note: str | None
    category: CategoryRef
    sub_category: CategoryRef | None
    created_at: datetime
    updated_at: datetime


class ExpenseListParams(PageParams):
    date_from: date | None = None
    date_to: date | None = None
    category_id: list[uuid.UUID] = Field(default_factory=list)
    sub_category_id: uuid.UUID | None = None
    sort: Literal["date", "amount"] = "date"
    order: Literal["asc", "desc"] = "desc"

    @model_validator(mode="after")
    def date_range_is_ordered(self) -> Self:
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self
