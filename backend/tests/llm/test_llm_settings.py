import pytest
from pydantic import ValidationError

from config.llm import LLMSettings


def test_defaults_to_fake_provider_without_a_key(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    settings = LLMSettings(_env_file=None)
    assert settings.provider == "fake"
    assert settings.anthropic_api_key is None


def test_anthropic_provider_without_key_raises():
    with pytest.raises(ValidationError):
        LLMSettings(_env_file=None, provider="anthropic")


def test_anthropic_provider_with_key_is_valid():
    settings = LLMSettings(_env_file=None, provider="anthropic", anthropic_api_key="sk-test")
    assert settings.anthropic_api_key.get_secret_value() == "sk-test"


def test_blank_gemini_key_counts_as_missing():
    with pytest.raises(ValidationError, match="GEMINI_API_KEY"):
        LLMSettings(_env_file=None, provider="gemini", gemini_api_key="  ")
