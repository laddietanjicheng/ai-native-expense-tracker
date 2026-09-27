import uuid
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime

from core.analytics.constants import OTHER_SUBJECT_SUFFIX
from core.dates import add_months, days_in_month, is_current_month, month_start


@dataclass(frozen=True)
class ExpenseRow:
    id: uuid.UUID
    category_id: uuid.UUID
    sub_category_id: uuid.UUID | None
    amount_cents: int
    expense_date: date
    note: str | None
    created_at: datetime


@dataclass(frozen=True)
class CategoryInfo:
    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str


@dataclass(frozen=True)
class BudgetInfo:
    category_id: uuid.UUID | None
    amount_cents: int


@dataclass(frozen=True)
class ProposalRow:
    category_id: uuid.UUID | None
    name: str
    from_cents: int | None
    to_cents: int
    reason: str | None = None


@dataclass(frozen=True)
class Proposal:
    title: str
    rows: list[ProposalRow]
    footer: str


@dataclass
class Candidate:
    kind: str
    subject: str
    impact_cents: int
    display: list[str]
    proposal: Proposal | None = None
    novelty_key: str = field(init=False)

    def __post_init__(self) -> None:
        self.novelty_key = f"{self.kind}:{self.subject}"


@dataclass(frozen=True)
class ValidatedCard:
    type: str
    title: str
    body: str
    fact_ids: list[str]
    proposal: Proposal | None = None


def _month_key(d: date) -> tuple[int, int]:
    return (d.year, d.month)


def in_month(rows: Iterable[ExpenseRow], month: date) -> list[ExpenseRow]:
    key = _month_key(month)
    return [r for r in rows if _month_key(r.expense_date) == key]


def total_cents(rows: Iterable[ExpenseRow]) -> int:
    return sum(r.amount_cents for r in rows)


@dataclass
class Ledger:
    """All data + context a detector run needs for one (user, month). Pure: no DB, no wall clock."""

    month: date
    today: date  # SGT "today", injected so detectors are deterministic and testable
    rows: list[ExpenseRow]
    categories: list[CategoryInfo]
    budgets: list[BudgetInfo]

    def __post_init__(self) -> None:
        self.top_by_id: dict[uuid.UUID, CategoryInfo] = {
            c.id: c for c in self.categories if c.parent_id is None
        }
        self.sub_by_id: dict[uuid.UUID, CategoryInfo] = {
            c.id: c for c in self.categories if c.parent_id is not None
        }
        self.subs_of: dict[uuid.UUID, list[CategoryInfo]] = defaultdict(list)
        for c in sorted(self.sub_by_id.values(), key=lambda c: c.name.lower()):
            self.subs_of[c.parent_id].append(c)

    def month_rows(self, offset: int) -> list[ExpenseRow]:
        return in_month(self.rows, add_months(month_start(self.month), offset))

    def budget_for(self, category_id: uuid.UUID | None) -> BudgetInfo | None:
        for b in self.budgets:
            if b.category_id == category_id:
                return b
        return None

    @property
    def is_current_month(self) -> bool:
        return is_current_month(self.month, self.today)

    @property
    def days_in_month(self) -> int:
        return days_in_month(self.month)

    @property
    def days_elapsed(self) -> int:
        if not self.is_current_month:
            return self.days_in_month
        return min(self.today.day, self.days_in_month)


def budget_status(spent: int, cap: int, projected: int | None, current: bool) -> str:
    if spent > cap:
        return "Over"
    if current and projected is not None and projected > cap:
        return "At risk"
    return "On track"


def subject_groups(
    category: CategoryInfo, subs: list[CategoryInfo]
) -> list[tuple[str, Callable[[ExpenseRow], bool]]]:
    """(label, predicate) pairs to group a category's expenses for sub-category-level detectors.

    A category without sub-categories is one subject. A category with sub-categories is split
    into one subject per sub-category, plus an explicit "<Category> (other)" subject for
    expenses posted directly to the category with no sub-category chosen (decision: nothing
    should be invisible to these detectors).
    """
    if not subs:
        return [(category.name, lambda r: r.category_id == category.id)]

    groups = [
        (f"{category.name} > {s.name}", (lambda sid: lambda r: r.sub_category_id == sid)(s.id))
        for s in subs
    ]
    groups.append(
        (
            f"{category.name}{OTHER_SUBJECT_SUFFIX}",
            (lambda cid: lambda r: r.category_id == cid and r.sub_category_id is None)(category.id),
        )
    )
    return groups
