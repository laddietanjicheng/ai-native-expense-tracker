from unittest.mock import patch

from config.llm import get_llm_settings
from core.llm.factory import get_llm_client
from core.llm.fake import FakeLLMClient


def _clear_caches():
    get_llm_settings.cache_clear()
    get_llm_client.cache_clear()


def test_factory_returns_fake_client_by_default(monkeypatch):
    _clear_caches()
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    try:
        assert isinstance(get_llm_client(), FakeLLMClient)
    finally:
        _clear_caches()


@patch("core.llm.anthropic.Anthropic")
def test_factory_returns_anthropic_client_when_configured(mock_anthropic, monkeypatch):
    from core.llm.anthropic import AnthropicClient

    _clear_caches()
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    try:
        client = get_llm_client()
        assert isinstance(client, AnthropicClient)
    finally:
        _clear_caches()


def test_llm_settings_singleton_is_cached():
    _clear_caches()
    try:
        assert get_llm_settings() is get_llm_settings()
    finally:
        _clear_caches()
