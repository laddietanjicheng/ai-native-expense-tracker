"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-26

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "app_user",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.String(255), unique=True, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )

    op.create_table(
        "category",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("category.id"),
            nullable=True,
        ),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_category_name_not_blank"),
        sa.UniqueConstraint("id", "parent_id", name="uq_category_id_parent_id"),
    )
    op.create_index(
        "uq_category_top_name",
        "category",
        [sa.text("user_id"), sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("parent_id IS NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_category_sub_name",
        "category",
        [sa.text("parent_id"), sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("parent_id IS NOT NULL AND deleted_at IS NULL"),
    )

    op.create_table(
        "expense",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column("sub_category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "amount_cents > 0 AND amount_cents <= 100000000",
            name="ck_expense_amount_cents_range",
        ),
        sa.ForeignKeyConstraint(
            ["sub_category_id", "category_id"],
            ["category.id", "category.parent_id"],
            name="fk_expense_sub_category_matches_category",
        ),
    )
    op.create_index(
        "ix_expense_user_date",
        "expense",
        ["user_id", sa.text("expense_date DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_expense_user_category",
        "expense",
        ["user_id", "category_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("expense")
    op.drop_index("uq_category_sub_name", table_name="category")
    op.drop_index("uq_category_top_name", table_name="category")
    op.drop_table("category")
    op.drop_table("app_user")
