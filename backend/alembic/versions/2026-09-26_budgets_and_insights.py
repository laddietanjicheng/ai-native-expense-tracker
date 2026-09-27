"""budgets and insights

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-26

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app_user.id"), nullable=False
        ),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("category.id")),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "amount_cents > 0 AND amount_cents <= 100000000", name="ck_budget_amount_cents_range"
        ),
    )
    op.create_index(
        "uq_budget_overall",
        "budget",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("category_id IS NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_budget_category",
        "budget",
        ["user_id", "category_id"],
        unique=True,
        postgresql_where=sa.text("category_id IS NOT NULL AND deleted_at IS NULL"),
    )

    op.create_table(
        "insight_report",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app_user.id"), nullable=False
        ),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("facts_hash", sa.String(64), nullable=False),
        sa.Column("cards", postgresql.JSONB(), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.CheckConstraint("extract(day from month) = 1", name="ck_insight_report_month_is_first_of_month"),
        sa.UniqueConstraint("user_id", "month", name="uq_insight_report_user_id_month"),
    )

    op.create_table(
        "insight_generation",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app_user.id"), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_index("ix_insight_generation_user_created", "insight_generation", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("insight_generation")
    op.drop_table("insight_report")
    op.drop_index("uq_budget_category", table_name="budget")
    op.drop_index("uq_budget_overall", table_name="budget")
    op.drop_table("budget")
