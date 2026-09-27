from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from google.genai import errors, types
from pydantic import SecretStr

from config.llm import LLMSettings
from core.llm.base import StreamStop, TextDelta, ToolSpec, ToolUseRequest
from core.llm.gemini import GeminiClient, _sanitize_schema


def _settings(**overrides) -> LLMSettings:
    defaults = {"_env_file": None, "provider": "gemini", "gemini_api_key": SecretStr("g-test")}
    defaults.update(overrides)
    return LLMSettings(**defaults)


def _function_call(name: str, args: dict, call_id: str | None = None):
    return SimpleNamespace(id=call_id, name=name, args=args)


def _part(text: str | None = None, function_call=None):
    return SimpleNamespace(text=text, function_call=function_call)


def _candidate(parts: list, finish_reason=None):
    return SimpleNamespace(
        content=SimpleNamespace(parts=parts) if parts is not None else None,
        finish_reason=finish_reason,
    )


# ---------------------------------------------------------------------------
# Schema sanitising
# ---------------------------------------------------------------------------


def test_sanitize_schema_strips_unsupported_keywords():
    schema = {
        "type": "object",
        "additionalProperties": False,
        "$defs": {"Foo": {"type": "string"}},
        "title": "Something",
        "properties": {
            "cards": {
                "type": "array",
                "items": {"$ref": "#/$defs/Foo", "default": "x", "type": "string"},
            }
        },
    }
    sanitized = _sanitize_schema(schema)
    assert sanitized == {
        "type": "object",
        "properties": {"cards": {"type": "array", "items": {"type": "string"}}},
    }


def test_sanitize_schema_recurses_into_plain_lists():
    assert _sanitize_schema([{"type": "string", "default": "x"}]) == [{"type": "string"}]


# ---------------------------------------------------------------------------
# generate_structured
# ---------------------------------------------------------------------------


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_returns_forced_function_call_args(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = SimpleNamespace(
        candidates=[
            _candidate([_part(function_call=_function_call("write_insight_cards", {"cards": []}))])
        ]
    )
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    result = client.generate_structured(
        "system", "prompt", {"type": "object"}, "write_insight_cards"
    )

    assert result == {"cards": []}
    _, kwargs = mock_client.models.generate_content.call_args
    assert kwargs["config"].tool_config.function_calling_config.mode == "ANY"
    assert kwargs["config"].tool_config.function_calling_config.allowed_function_names == [
        "write_insight_cards"
    ]
    assert kwargs["config"].automatic_function_calling.disable is True


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_raises_without_matching_function_call(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = SimpleNamespace(candidates=[])
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    with pytest.raises(RuntimeError):
        client.generate_structured("system", "prompt", {}, "write_insight_cards")


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_skips_candidates_without_content(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = SimpleNamespace(
        candidates=[
            _candidate(None),
            _candidate([_part(function_call=_function_call("write_insight_cards", {"cards": []}))]),
        ]
    )
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    result = client.generate_structured(
        "system", "prompt", {"type": "object"}, "write_insight_cards"
    )
    assert result == {"cards": []}


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_maps_quota_error(mock_client_cls):
    mock_client = MagicMock()
    error = errors.ClientError(code=429, response_json={"error": {"message": "quota"}})
    mock_client.models.generate_content.side_effect = error
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    with pytest.raises(RuntimeError, match="quota"):
        client.generate_structured("system", "prompt", {}, "write_insight_cards")


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_maps_generic_api_error(mock_client_cls):
    mock_client = MagicMock()
    error = errors.ServerError(code=500, response_json={"error": {"message": "boom"}})
    mock_client.models.generate_content.side_effect = error
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    with pytest.raises(RuntimeError):
        client.generate_structured("system", "prompt", {}, "write_insight_cards")


@patch("core.llm.gemini.genai.Client")
def test_generate_structured_never_leaks_api_key_on_error(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = RuntimeError("network exploded")
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings(gemini_api_key=SecretStr("super-secret-key")))
    with pytest.raises(RuntimeError) as exc_info:
        client.generate_structured("system", "prompt", {}, "write_insight_cards")

    assert "super-secret-key" not in str(exc_info.value)


# ---------------------------------------------------------------------------
# stream_turn
# ---------------------------------------------------------------------------


@patch("core.llm.gemini.genai.Client")
def test_stream_turn_yields_text_then_tool_use_then_stop(mock_client_cls):
    chunks = [
        SimpleNamespace(candidates=[_candidate([_part(text="Hello ")])]),
        SimpleNamespace(candidates=[_candidate([_part(text="there")])]),
        SimpleNamespace(
            candidates=[
                _candidate(
                    [
                        _part(
                            function_call=_function_call(
                                "get_month_summary", {"month": "2026-09"}, "call_1"
                            )
                        )
                    ],
                    finish_reason=types.FinishReason.STOP,
                )
            ]
        ),
    ]
    mock_client = MagicMock()
    mock_client.models.generate_content_stream.return_value = iter(chunks)
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    tools = [ToolSpec(name="get_month_summary", description="d", input_schema={}, status_text="s")]
    events = list(client.stream_turn("system", [], tools, 1500))

    assert events == [
        TextDelta(text="Hello "),
        TextDelta(text="there"),
        ToolUseRequest(id="call_1", name="get_month_summary", input={"month": "2026-09"}),
        StreamStop(reason="tool_use"),
    ]


@patch("core.llm.gemini.genai.Client")
def test_stream_turn_generates_stable_id_when_gemini_omits_one(mock_client_cls):
    chunks = [
        SimpleNamespace(
            candidates=[
                _candidate(
                    [_part(function_call=_function_call("get_budgets", {}, call_id=None))],
                    finish_reason=types.FinishReason.STOP,
                )
            ]
        )
    ]
    mock_client = MagicMock()
    mock_client.models.generate_content_stream.return_value = iter(chunks)
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    events = list(client.stream_turn("system", [], [], 1500))

    tool_use = next(e for e in events if isinstance(e, ToolUseRequest))
    assert tool_use.id
    assert tool_use.name == "get_budgets"


@patch("core.llm.gemini.genai.Client")
def test_stream_turn_maps_end_turn_and_max_tokens(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    client = GeminiClient(_settings())

    mock_client.models.generate_content_stream.return_value = iter(
        [SimpleNamespace(candidates=[_candidate([], finish_reason=types.FinishReason.STOP)])]
    )
    assert list(client.stream_turn("s", [], [], 100)) == [StreamStop(reason="end_turn")]

    mock_client.models.generate_content_stream.return_value = iter(
        [SimpleNamespace(candidates=[_candidate([], finish_reason=types.FinishReason.MAX_TOKENS)])]
    )
    assert list(client.stream_turn("s", [], [], 100)) == [StreamStop(reason="max_tokens")]

    mock_client.models.generate_content_stream.return_value = iter(
        [SimpleNamespace(candidates=[_candidate([], finish_reason=types.FinishReason.SAFETY)])]
    )
    assert list(client.stream_turn("s", [], [], 100)) == [StreamStop(reason="other")]


@patch("core.llm.gemini.genai.Client")
def test_stream_turn_maps_sdk_error(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content_stream.side_effect = errors.ClientError(
        code=429, response_json={"error": {"message": "quota"}}
    )
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    with pytest.raises(RuntimeError, match="quota"):
        list(client.stream_turn("system", [], [], 1500))


# ---------------------------------------------------------------------------
# Message-history round-trip: assistant tool_use + user tool_result -> Gemini contents
# ---------------------------------------------------------------------------


@patch("core.llm.gemini.genai.Client")
def test_stream_turn_maps_generic_non_api_error(mock_client_cls):
    mock_client = MagicMock()
    mock_client.models.generate_content_stream.side_effect = ValueError("boom")
    mock_client_cls.return_value = mock_client

    client = GeminiClient(_settings())
    with pytest.raises(RuntimeError, match="Gemini request failed"):
        list(client.stream_turn("system", [], [], 1500))


@patch("core.llm.gemini.genai.Client")
def test_build_contents_round_trips_tool_loop_history(mock_client_cls):
    mock_client_cls.return_value = MagicMock()
    client = GeminiClient(_settings())

    messages = [
        {"role": "user", "content": [{"type": "text", "text": "How much did I spend?"}]},
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "get_month_summary",
                    "input": {"month": "2026-09"},
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "toolu_1", "content": '{"total": 100}'}
            ],
        },
    ]

    contents = client._build_contents(messages)

    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[0].parts[0].text == "How much did I spend?"

    call_part = contents[1].parts[0].function_call
    assert call_part.id == "toolu_1"
    assert call_part.name == "get_month_summary"
    assert call_part.args == {"month": "2026-09"}

    response_part = contents[2].parts[0].function_response
    assert response_part.id == "toolu_1"
    assert response_part.name == "get_month_summary"  # recovered by id, not restated
    assert response_part.response == {"result": '{"total": 100}'}


# ---------------------------------------------------------------------------
# Settings / factory
# ---------------------------------------------------------------------------


def test_gemini_provider_without_key_raises():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        LLMSettings(_env_file=None, provider="gemini")


def test_gemini_provider_with_key_is_valid():
    settings = LLMSettings(_env_file=None, provider="gemini", gemini_api_key="g-test")
    assert settings.gemini_api_key.get_secret_value() == "g-test"


def test_model_for_provider_accessors():
    settings = LLMSettings(_env_file=None, provider="gemini", gemini_api_key="g-test")
    assert settings.insights_model_for_provider() == settings.gemini_insights_model
    assert settings.chat_model_for_provider() == settings.gemini_chat_model

    anthropic_settings = LLMSettings(
        _env_file=None, provider="anthropic", anthropic_api_key="sk-test"
    )
    assert anthropic_settings.insights_model_for_provider() == anthropic_settings.insights_model
    assert anthropic_settings.chat_model_for_provider() == anthropic_settings.chat_model


@patch("core.llm.gemini.genai.Client")
def test_factory_returns_gemini_client_when_configured(mock_client_cls, monkeypatch):
    from config.llm import get_llm_settings
    from core.llm.factory import get_llm_client

    get_llm_settings.cache_clear()
    get_llm_client.cache_clear()
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "g-test")
    try:
        client = get_llm_client()
        assert isinstance(client, GeminiClient)
    finally:
        get_llm_settings.cache_clear()
        get_llm_client.cache_clear()
