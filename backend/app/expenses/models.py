import uuid
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.categories.models import Category
from core.database import Base
from core.models import SoftDeleteMixin, TimestampMixin


class Expense(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "expense"
    __table_args__ = (
        ForeignKeyConstraint(
            ["sub_category_id", "category_id"],
            ["category.id", "category.parent_id"],
            name="sub_category_matches_category",
        ),
        CheckConstraint(
            "amount_cents > 0 AND amount_cents <= 100000000",
            name="amount_cents_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("category.id"), nullable=False
    )
    sub_category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    expense_date: Mapped[date] = mapped_column(nullable=False)
    note: Mapped[str | None] = mapped_column()

    category: Mapped["Category"] = relationship(
        "Category", foreign_keys=[category_id], viewonly=True
    )
    sub_category: Mapped["Category | None"] = relationship(
        "Category", foreign_keys=[sub_category_id], viewonly=True
    )
