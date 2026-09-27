import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class InsightReport(Base):
    """The latest generated narration for a user's month; upserted on regeneration."""

    __tablename__ = "insight_report"
    __table_args__ = (
        UniqueConstraint("user_id", "month", name="uq_insight_report_user_id_month"),
        CheckConstraint("extract(day from month) = 1", name="month_is_first_of_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False
    )
    month: Mapped[date] = mapped_column(nullable=False)
    facts_hash: Mapped[str] = mapped_column(nullable=False)
    cards: Mapped[list] = mapped_column(JSONB, nullable=False)
    model: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InsightGeneration(Base):
    """One row per narration generation attempt, kept only to enforce the daily rate limit
    (insight_report is upserted per user+month, so it cannot count same-day regenerations)."""

    __tablename__ = "insight_generation"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
