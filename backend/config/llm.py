from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import SettingsConfigDict

from config.base import BaseConfig

LLMProvider = Literal["anthropic", "fake", "gemini"]


def _has_value(secret: SecretStr | None) -> bool:
    return secret is not None and bool(secret.get_secret_value().strip())


class LLMSettings(BaseConfig):
    model_config = SettingsConfigDict(populate_by_name=True)

    provider: LLMProvider = Field(default="fake", validation_alias="LLM_PROVIDER")
    anthropic_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    insights_model: str = "claude-sonnet-5"
    chat_model: str = "claude-sonnet-5"
    gemini_insights_model: str = "gemini-3.8-flash"
    gemini_chat_model: str = "gemini-3.8-flash"
    request_timeout_seconds: int = 30
    insights_daily_limit: int = 20
    chat_daily_limit: int = 60

    @model_validator(mode="after")
    def provider_requires_key(self) -> Self:
        if self.provider == "anthropic" and not _has_value(self.anthropic_api_key):
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER is 'anthropic'")
        if self.provider == "gemini" and not _has_value(self.gemini_api_key):
            raise ValueError("GEMINI_API_KEY is required when LLM_PROVIDER is 'gemini'")
        return self

    def insights_model_for_provider(self) -> str:
        """The insights model actually used by the active provider (recorded on InsightReport)."""
        return self.gemini_insights_model if self.provider == "gemini" else self.insights_model

    def chat_model_for_provider(self) -> str:
        """The chat model actually used by the active provider."""
        return self.gemini_chat_model if self.provider == "gemini" else self.chat_model


@lru_cache
def get_llm_settings() -> LLMSettings:
    return LLMSettings()
