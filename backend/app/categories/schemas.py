import uuid
from datetime import date
from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from app.shared.schemas import CustomModel

NAME_MAX_LENGTH = 50

CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH)
]


class CategoryCreate(CustomModel):
    name: CategoryName
    parent_id: uuid.UUID | None = None


class CategoryRename(CustomModel):
    name: CategoryName


class CategoryOut(CustomModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    expense_count: int = 0
    sub_categories: list["CategoryOut"] = Field(default_factory=list)


class CategoryTreeParams(CustomModel):
    """Scopes each node's expense_count to a date range; omitted bounds mean all time."""

    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def date_range_is_ordered(self) -> Self:
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self
