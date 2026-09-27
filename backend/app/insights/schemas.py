import uuid
from datetime import date, datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from app.shared.dates import month_start, parse_month_param, today_sgt
from app.shared.schemas import CustomModel

BudgetStatus = Literal["Over", "At risk", "On track"]
CardType = Literal[
    "pace",
    "change",
    "leak",
    "recurring",
    "timing",
    "trend",
    "budget",
    "anomaly",
    "win",
    "logging",
    "tip",
]


class MonthQuery(CustomModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")

    @model_validator(mode="after")
    def not_in_future(self) -> Self:
        if self.as_date > month_start(today_sgt()):
            raise ValueError("month cannot be in the future")
        return self

    @property
    def as_date(self) -> date:
        return parse_month_param(self.month)


class SummaryOut(CustomModel):
    total_cents: int
    prev_total_cents: int
    delta_vs_prev_cents: int
    delta_vs_prev_pct: float | None
    avg3_cents: int
    delta_vs_avg3_cents: int
    delta_vs_avg3_pct: float | None
    projected_cents: int | None
    days_elapsed: int
    days_in_month: int


class SubCategoryChange(CustomModel):
    category_id: uuid.UUID
    name: str
    now_cents: int
    prev_cents: int
    delta_cents: int


class CategoryChange(CustomModel):
    category_id: uuid.UUID
    name: str
    now_cents: int
    prev_cents: int
    delta_cents: int
    sub_categories: list[SubCategoryChange] = Field(default_factory=list)


class BudgetProgress(CustomModel):
    category_id: uuid.UUID | None
    name: str
    cap_cents: int
    spent_cents: int
    pct: float
    projected_cents: int | None
    status: BudgetStatus


class ProposalRow(CustomModel):
    category_id: uuid.UUID | None
    name: str
    from_cents: int | None
    to_cents: int
    reason: str | None = None


class Proposal(CustomModel):
    title: str
    rows: list[ProposalRow]
    footer: str


class Card(CustomModel):
    type: CardType
    title: str
    body: str
    fact_ids: list[str]
    proposal: Proposal | None = None


class Narration(CustomModel):
    cards: list[Card]
    model: str
    created_at: datetime


class InsightsOut(CustomModel):
    month: date
    summary: SummaryOut
    changes: list[CategoryChange]
    budgets: list[BudgetProgress]
    narration: Narration | None
    is_stale: bool
