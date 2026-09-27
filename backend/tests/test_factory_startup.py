import pytest
from pydantic import ValidationError

from app.factory import create_app
from config.llm import get_llm_settings
from core.llm.factory import get_llm_client


def _clear_llm_caches() -> None:
    get_llm_settings.cache_clear()
    get_llm_client.cache_clear()


def test_create_app_fails_fast_when_anthropic_provider_has_no_key(monkeypatch):
    _clear_llm_caches()
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    try:
        with pytest.raises(ValidationError):
            create_app()
    finally:
        _clear_llm_caches()


def test_create_app_fails_fast_when_gemini_provider_has_no_key(monkeypatch):
    _clear_llm_caches()
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    try:
        with pytest.raises(ValidationError):
            create_app()
    finally:
        _clear_llm_caches()


def test_create_app_succeeds_with_fake_provider(monkeypatch):
    _clear_llm_caches()
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    try:
        app = create_app()
        assert app is not None
    finally:
        _clear_llm_caches()
