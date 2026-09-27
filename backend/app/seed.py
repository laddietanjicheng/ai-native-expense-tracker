from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.dependencies import DEFAULT_USER_ID
from app.users.models import User
from core.database import SessionLocal

DEFAULT_CATEGORIES: dict[str, list[str]] = {
    "Food": ["Groceries", "Dining Out", "Coffee & Snacks"],
    "Transport": ["Public Transport", "Taxi & Ride-hailing", "Fuel & Parking"],
    "Bills & Utilities": ["Electricity & Water", "Phone & Internet", "Subscriptions"],
    "Shopping": ["Clothing", "Household", "Electronics"],
    "Health": ["Medical", "Pharmacy", "Fitness"],
    "Entertainment": ["Movies & Events", "Hobbies", "Travel"],
    "Other": [],
}


def seed_defaults(db: Session) -> None:
    if db.get(User, DEFAULT_USER_ID) is None:
        db.add(User(id=DEFAULT_USER_ID))
        db.flush()

    existing_stmt = select(func.lower(Category.name)).where(
        Category.user_id == DEFAULT_USER_ID,
        Category.parent_id.is_(None),
        Category.deleted_at.is_(None),
    )
    existing = set(db.execute(existing_stmt).scalars())

    for top_name, sub_names in DEFAULT_CATEGORIES.items():
        if top_name.lower() in existing:
            continue
        top = Category(user_id=DEFAULT_USER_ID, name=top_name)
        db.add(top)
        db.flush()
        db.add_all(Category(user_id=DEFAULT_USER_ID, name=n, parent_id=top.id) for n in sub_names)
    db.commit()


if __name__ == "__main__":
    with SessionLocal() as session:
        seed_defaults(session)
