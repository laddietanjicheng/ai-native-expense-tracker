import uuid

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from core.models import SoftDeleteMixin, TimestampMixin


class Category(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "category"
    __table_args__ = (
        UniqueConstraint("id", "parent_id", name="uq_category_id_parent_id"),
        CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("category.id")
    )
    name: Mapped[str] = mapped_column(nullable=False)
