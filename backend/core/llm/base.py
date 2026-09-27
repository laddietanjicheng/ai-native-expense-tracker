from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class ToolSpec:
    """A tool definition passed to `stream_turn`, provider-agnostic (JSON schema input)."""

    name: str
    description: str
    input_schema: dict[str, Any]
    status_text: str


@dataclass(frozen=True)
class TextDelta:
    """A chunk of the assistant's answer text."""

    text: str


@dataclass(frozen=True)
class ToolUseRequest:
    """The model asking to call one tool."""

    id: str
    name: str
    input: dict[str, Any]


StopReason = Literal["end_turn", "tool_use", "max_tokens", "other"]


@dataclass(frozen=True)
class StreamStop:
    """The final event of a turn: why generation stopped."""

    reason: StopReason


LLMEvent = TextDelta | ToolUseRequest | StreamStop


class LLMClient(Protocol):
    """The only type app code depends on for LLM access."""

    def generate_structured(
        self, system: str, prompt: str, schema: dict[str, Any], tool_name: str
    ) -> dict[str, Any]:
        """Force the model to call `tool_name` with `schema` and return its input."""
        ...

    def stream_turn(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Iterator[LLMEvent]:
        """Stream one assistant turn: text deltas and/or tool-use requests, then a stop reason.

        `messages` follows the Anthropic Messages API block shape (role + list of content
        blocks: text, tool_use, tool_result), which `core/agents/tool_loop.py` builds and grows
        round to round. Providers translate to/from their own wire format inside this method.
        """
        ...
