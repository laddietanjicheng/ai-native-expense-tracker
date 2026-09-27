from functools import lru_cache

from config.base import BaseConfig


class DatabaseSettings(BaseConfig):
    database_url: str = "postgresql+psycopg://expense:expense@localhost:5432/expense_tracker"
    test_database_url: str = (
        "postgresql+psycopg://expense:expense@localhost:5432/expense_tracker_test"
    )


@lru_cache
def get_database_settings() -> DatabaseSettings:
    return DatabaseSettings()
