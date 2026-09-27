import uuid

from sqlalchemy import CheckConstraint, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from core.models import SoftDeleteMixin, TimestampMixin

MAX_BUDGET_CENTS = 100_000_000


class Budget(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "budget"
    __table_args__ = (
        CheckConstraint(
            f"amount_cents > 0 AND amount_cents <= {MAX_BUDGET_CENTS}",
            name="amount_cents_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("category.id")
    )
    amount_cents: Mapped[int] = mapped_column(nullable=False)
