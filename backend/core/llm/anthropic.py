from collections.abc import Iterator
from typing import Any

from anthropic import Anthropic

from config.llm import LLMSettings
from core.llm.base import LLMEvent, StreamStop, TextDelta, ToolSpec, ToolUseRequest

MAX_OUTPUT_TOKENS = 1500


class AnthropicClient:
    """LLMClient backed by the Anthropic SDK, using forced tool use for structured output."""

    def __init__(self, settings: LLMSettings) -> None:
        api_key = (
            settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
        )
        self._client = Anthropic(api_key=api_key, timeout=settings.request_timeout_seconds)
        self._model = settings.insights_model
        self._chat_model = settings.chat_model

    def generate_structured(
        self, system: str, prompt: str, schema: dict[str, Any], tool_name: str
    ) -> dict[str, Any]:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            tools=[
                {
                    "name": tool_name,
                    "description": "Return the structured result for this request.",
                    "input_schema": schema,
                }
            ],
            tool_choice={"type": "tool", "name": tool_name},
        )
        for block in response.content:
            if block.type == "tool_use" and block.name == tool_name:
                return block.input
        raise RuntimeError("Anthropic response did not include the expected tool call")

    def _tool_params(self, tools: list[ToolSpec]) -> list[dict[str, Any]]:
        params = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ]
        if params:
            # Cache the (typically large, stable) tool definitions block across turns/rounds.
            params[-1] = {**params[-1], "cache_control": {"type": "ephemeral"}}
        return params

    def stream_turn(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Iterator[LLMEvent]:
        system_param = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        with self._client.messages.stream(
            model=self._chat_model,
            max_tokens=max_tokens,
            system=system_param,
            messages=messages,
            tools=self._tool_params(tools),
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    yield TextDelta(text=event.delta.text)
            final_message = stream.get_final_message()

        for block in final_message.content:
            if block.type == "tool_use":
                yield ToolUseRequest(id=block.id, name=block.name, input=block.input)

        known_reasons = {"end_turn", "tool_use", "max_tokens"}
        reason = final_message.stop_reason
        yield StreamStop(reason=reason if reason in known_reasons else "other")
