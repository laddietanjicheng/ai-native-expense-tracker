import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from alembic import command
from app.categories.models import Category
from app.dependencies import DEFAULT_USER_ID
from app.factory import create_app
from app.seed import seed_defaults
from config.database import get_database_settings
from core.database import get_db

BACKEND_ROOT = Path(__file__).resolve().parents[1]
db_settings = get_database_settings()

test_engine = create_engine(db_settings.test_database_url, pool_pre_ping=True)


@pytest.fixture(scope="session", autouse=True)
def _apply_migrations() -> None:
    assert db_settings.test_database_url != db_settings.database_url, (
        "Tests must not use the dev DB"
    )
    with test_engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    alembic_config = Config(str(BACKEND_ROOT / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    alembic_config.attributes["database_url"] = db_settings.test_database_url
    command.upgrade(alembic_config, "head")


@pytest.fixture
def db_session() -> Generator[Session]:
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    seed_defaults(session)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user_id() -> uuid.UUID:
    return DEFAULT_USER_ID


@pytest.fixture
def categories(db_session: Session) -> dict[str, Category]:
    rows = (
        db_session.query(Category)
        .filter(Category.user_id == DEFAULT_USER_ID, Category.deleted_at.is_(None))
        .all()
    )
    return {row.name: row for row in rows}
