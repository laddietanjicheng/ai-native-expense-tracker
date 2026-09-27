from functools import lru_cache
from typing import Literal

from config.base import BaseConfig

Environment = Literal["local", "staging", "production"]


class AppSettings(BaseConfig):
    environment: Environment = "local"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_app_settings() -> AppSettings:
    return AppSettings()
