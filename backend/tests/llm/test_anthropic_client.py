from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from pydantic import SecretStr

from config.llm import LLMSettings
from core.llm.anthropic import AnthropicClient
from core.llm.base import StreamStop, TextDelta, ToolSpec, ToolUseRequest


def _settings() -> LLMSettings:
    return LLMSettings(_env_file=None, provider="anthropic", anthropic_api_key=SecretStr("sk-test"))


def _tool_use_block(name: str, input_: dict):
    return SimpleNamespace(type="tool_use", name=name, input=input_)


@patch("core.llm.anthropic.Anthropic")
def test_generate_structured_returns_tool_input(mock_anthropic):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = SimpleNamespace(
        content=[_tool_use_block("write_insight_cards", {"cards": []})]
    )
    mock_anthropic.return_value = mock_client

    client = AnthropicClient(_settings())
    result = client.generate_structured(
        "system", "prompt", {"type": "object"}, "write_insight_cards"
    )

    assert result == {"cards": []}
    mock_client.messages.create.assert_called_once()
    _, kwargs = mock_client.messages.create.call_args
    assert kwargs["tool_choice"] == {"type": "tool", "name": "write_insight_cards"}


@patch("core.llm.anthropic.Anthropic")
def test_generate_structured_raises_without_matching_tool_use(mock_anthropic):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = SimpleNamespace(content=[])
    mock_anthropic.return_value = mock_client

    client = AnthropicClient(_settings())
    with pytest.raises(RuntimeError):
        client.generate_structured("system", "prompt", {}, "write_insight_cards")


def _text_delta_event(text: str):
    return SimpleNamespace(
        type="content_block_delta", delta=SimpleNamespace(type="text_delta", text=text)
    )


def _other_event():
    return SimpleNamespace(type="content_block_start", delta=None)


def _stream_manager(events: list, final_message):
    manager = MagicMock()
    manager.__enter__.return_value = manager
    manager.__exit__.return_value = False
    manager.__iter__.return_value = iter(events)
    manager.get_final_message.return_value = final_message
    return manager


@patch("core.llm.anthropic.Anthropic")
def test_stream_turn_yields_text_then_tool_use_then_stop(mock_anthropic):
    final_message = SimpleNamespace(
        content=[
            SimpleNamespace(
                type="tool_use", id="tu_1", name="get_month_summary", input={"month": "2026-09"}
            )
        ],
        stop_reason="tool_use",
    )
    mock_client = MagicMock()
    mock_client.messages.stream.return_value = _stream_manager(
        [_text_delta_event("Hello "), _text_delta_event("there"), _other_event()], final_message
    )
    mock_anthropic.return_value = mock_client

    client = AnthropicClient(_settings())
    tools = [ToolSpec(name="get_month_summary", description="d", input_schema={}, status_text="s")]
    events = list(client.stream_turn("system", [], tools, 1500))

    assert events == [
        TextDelta(text="Hello "),
        TextDelta(text="there"),
        ToolUseRequest(id="tu_1", name="get_month_summary", input={"month": "2026-09"}),
        StreamStop(reason="tool_use"),
    ]

    _, kwargs = mock_client.messages.stream.call_args
    assert kwargs["system"] == [
        {"type": "text", "text": "system", "cache_control": {"type": "ephemeral"}}
    ]
    assert kwargs["tools"][-1]["cache_control"] == {"type": "ephemeral"}


@patch("core.llm.anthropic.Anthropic")
def test_stream_turn_normalises_unknown_stop_reason(mock_anthropic):
    final_message = SimpleNamespace(content=[], stop_reason="pause_turn")
    mock_client = MagicMock()
    mock_client.messages.stream.return_value = _stream_manager([], final_message)
    mock_anthropic.return_value = mock_client

    client = AnthropicClient(_settings())
    events = list(client.stream_turn("system", [], [], 1500))
    assert events == [StreamStop(reason="other")]
