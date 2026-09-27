"""Demo data for local testing: extra categories plus ~6 months of expenses.

Run with `python -m app.seed_demo`. Safe to re-run: it does nothing once the "Pets" category exists.
"""

import random
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.dependencies import DEFAULT_USER_ID
from app.expenses.models import Expense
from app.seed import seed_defaults
from core.database import SessionLocal

DEMO_MARKER_CATEGORY = "Pets"
EXPENSE_COUNT = 120
DAYS_BACK = 180

EXTRA_CATEGORIES: dict[str, list[str]] = {
    "Pets": ["Food & Supplies", "Vet"],
    "Education": ["Courses", "Books"],
    "Personal Care": ["Haircut", "Skincare"],
}
EXTRA_SUB_CATEGORIES: dict[str, list[str]] = {"Food": ["Food Delivery"]}

# (category, sub-category or None, note, min cents, max cents, relative weight)
EXPENSE_TEMPLATES = [
    ("Food", "Dining Out", "Lunch at hawker centre", 450, 1200, 14),
    ("Food", "Coffee & Snacks", "Kopi and kaya toast", 180, 650, 12),
    ("Food", "Groceries", "Weekly groceries", 4500, 14000, 6),
    ("Food", "Food Delivery", "Dinner delivery", 1800, 4500, 5),
    ("Transport", "Public Transport", "Transit card top-up", 2000, 5000, 5),
    ("Transport", "Taxi & Ride-hailing", "Ride home", 1200, 3500, 5),
    ("Transport", "Fuel & Parking", "Parking", 300, 1500, 2),
    ("Bills & Utilities", "Phone & Internet", "Mobile plan", 3000, 4500, 1),
    ("Bills & Utilities", "Electricity & Water", "Utilities bill", 8000, 16000, 1),
    ("Bills & Utilities", "Subscriptions", "Streaming subscription", 998, 1998, 1),
    ("Shopping", "Clothing", "New shirt", 2500, 8000, 2),
    ("Shopping", "Household", "Household supplies", 800, 4000, 3),
    ("Shopping", "Electronics", "Phone accessories", 1500, 12000, 1),
    ("Health", "Pharmacy", "Pharmacy", 800, 3500, 2),
    ("Health", "Fitness", "Gym session", 1500, 3000, 2),
    ("Health", "Medical", "Clinic visit", 3000, 9000, 1),
    ("Entertainment", "Movies & Events", "Movie tickets", 1300, 3200, 2),
    ("Entertainment", "Hobbies", "Hobby supplies", 1000, 6000, 1),
    ("Entertainment", "Travel", "Weekend getaway", 15000, 60000, 1),
    ("Pets", "Food & Supplies", "Pet food", 2500, 7000, 1),
    ("Pets", "Vet", "Vet check-up", 6000, 15000, 1),
    ("Education", "Books", "Book", 1500, 4000, 1),
    ("Education", "Courses", "Online course", 2000, 20000, 1),
    ("Personal Care", "Haircut", "Haircut", 1200, 3500, 1),
    ("Personal Care", "Skincare", "Skincare", 1500, 6000, 1),
    ("Other", None, "Gift", 2000, 8000, 1),
]


def _ensure_category(db: Session, name: str, parent: Category | None = None) -> Category:
    parent_id = parent.id if parent else None
    stmt = select(Category).where(
        Category.user_id == DEFAULT_USER_ID,
        Category.name == name,
        Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id,
        Category.deleted_at.is_(None),
    )
    category = db.execute(stmt).scalar_one_or_none()
    if category is None:
        category = Category(user_id=DEFAULT_USER_ID, name=name, parent_id=parent_id)
        db.add(category)
        db.flush()
    return category


def _build_category_index(
    db: Session,
) -> dict[tuple[str, str | None], tuple[Category, Category | None]]:
    for top_name, sub_names in {**EXTRA_CATEGORIES, **EXTRA_SUB_CATEGORIES}.items():
        top = _ensure_category(db, top_name)
        for sub_name in sub_names:
            _ensure_category(db, sub_name, top)

    index: dict[tuple[str, str | None], tuple[Category, Category | None]] = {}
    for category, sub_name, *_ in EXPENSE_TEMPLATES:
        top = _ensure_category(db, category)
        sub = _ensure_category(db, sub_name, top) if sub_name else None
        index[(category, sub_name)] = (top, sub)
    return index


def _demo_expenses(index, today: date) -> list[Expense]:
    rng = random.Random(42)
    weights = [template[-1] for template in EXPENSE_TEMPLATES]
    expenses = []
    for template in rng.choices(EXPENSE_TEMPLATES, weights=weights, k=EXPENSE_COUNT):
        category, sub_name, note, low, high, _ = template
        top, sub = index[(category, sub_name)]
        expenses.append(
            Expense(
                user_id=DEFAULT_USER_ID,
                category_id=top.id,
                sub_category_id=sub.id if sub else None,
                amount_cents=rng.randint(low, high),
                expense_date=today - timedelta(days=rng.randint(0, DAYS_BACK)),
                note=note,
            )
        )
    return expenses


def seed_demo(db: Session, today: date | None = None) -> int:
    seed_defaults(db)
    marker = select(Category.id).where(
        Category.user_id == DEFAULT_USER_ID,
        Category.name == DEMO_MARKER_CATEGORY,
        Category.parent_id.is_(None),
        Category.deleted_at.is_(None),
    )
    if db.execute(marker).first():
        return 0

    expenses = _demo_expenses(_build_category_index(db), today or date.today())
    db.add_all(expenses)
    db.commit()
    return len(expenses)


if __name__ == "__main__":
    with SessionLocal() as session:
        added = seed_demo(session)
    print(f"Added {added} demo expenses" if added else "Demo data already present")
