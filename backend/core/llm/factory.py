from collections.abc import Callable
from functools import lru_cache

from config.llm import LLMProvider, LLMSettings, get_llm_settings
from core.llm.anthropic import AnthropicClient
from core.llm.base import LLMClient
from core.llm.fake import FakeLLMClient
from core.llm.gemini import GeminiClient

_PROVIDERS: dict[LLMProvider, Callable[[LLMSettings], LLMClient]] = {
    "anthropic": AnthropicClient,
    "gemini": GeminiClient,
    "fake": lambda _settings: FakeLLMClient(),
}


@lru_cache
def get_llm_client() -> LLMClient:
    settings = get_llm_settings()
    return _PROVIDERS[settings.provider](settings)
