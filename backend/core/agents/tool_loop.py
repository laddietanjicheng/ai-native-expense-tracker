"""Generic provider-agnostic tool-use loop (spec §6.1, §9). No app imports: `app/chat/service.py`
supplies the tool specs and handlers; this module only knows how to drive an `LLMClient` through
rounds of tool calls and translate the results back into events for a caller (an SSE endpoint,
a test) to consume."""

import json
import logging
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from core.llm.base import LLMClient, StreamStop, TextDelta, ToolSpec, ToolUseRequest

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 6


@dataclass(frozen=True)
class ProposalReady:
    """A handler returns this instead of a plain result to signal a validated proposal: it is
    surfaced to the caller as a `ProposalEvent`, and a short acknowledgement (not the proposal's
    numbers) is fed back to the model as the tool result."""

    proposal: dict[str, Any]
    tool_result: str = "The plan was shown to the user as a card. Do not restate its numbers."


ToolHandler = Callable[[dict[str, Any]], "dict[str, Any] | str | ProposalReady"]


@dataclass(frozen=True)
class StatusEvent:
    text: str


@dataclass(frozen=True)
class TextEvent:
    text: str


@dataclass(frozen=True)
class ToolResultEvent:
    """Internal event (not sent to the client) used for the grounding check."""

    tool_name: str
    tool_use_id: str
    result: Any


@dataclass(frozen=True)
class ProposalEvent:
    proposal: dict[str, Any]


@dataclass(frozen=True)
class DoneEvent:
    text: str


@dataclass(frozen=True)
class ErrorEvent:
    message: str


AgentEvent = StatusEvent | TextEvent | ToolResultEvent | ProposalEvent | DoneEvent | ErrorEvent


def _result_to_text(result: dict[str, Any] | str) -> str:
    return result if isinstance(result, str) else json.dumps(result)


def _run_tool(
    tool_use: ToolUseRequest, handlers: dict[str, ToolHandler]
) -> tuple[dict[str, Any] | str | ProposalReady, bool]:
    handler = handlers.get(tool_use.name)
    if handler is None:
        return f"Unknown tool: {tool_use.name}", True
    try:
        return handler(tool_use.input), False
    except Exception as exc:  # noqa: BLE001 - handler errors become tool results, never crash
        logger.exception("Tool handler '%s' raised", tool_use.name)
        return f"Tool '{tool_use.name}' failed: {exc}", True


def run_tool_loop(
    llm: LLMClient,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[ToolSpec],
    handlers: dict[str, ToolHandler],
    max_tokens: int,
    max_rounds: int = MAX_TOOL_ROUNDS,
) -> Iterator[AgentEvent]:
    conversation = [dict(m) for m in messages]
    status_by_tool = {t.name: t.status_text for t in tools}

    for _round in range(max_rounds):
        text_chunks: list[str] = []
        tool_uses: list[ToolUseRequest] = []
        stop_reason = "end_turn"

        try:
            for event in llm.stream_turn(system, conversation, tools, max_tokens):
                if isinstance(event, TextDelta):
                    text_chunks.append(event.text)
                    yield TextEvent(text=event.text)
                elif isinstance(event, ToolUseRequest):
                    tool_uses.append(event)
                elif isinstance(event, StreamStop):
                    stop_reason = event.reason
        except Exception:
            logger.exception("LLM stream failed mid-turn")
            yield ErrorEvent(message="The assistant is unavailable right now. Please try again.")
            return

        full_text = "".join(text_chunks)
        assistant_content: list[dict[str, Any]] = []
        if full_text:
            assistant_content.append({"type": "text", "text": full_text})
        for tool_use in tool_uses:
            assistant_content.append(
                {
                    "type": "tool_use",
                    "id": tool_use.id,
                    "name": tool_use.name,
                    "input": tool_use.input,
                }
            )
        if assistant_content:
            conversation.append({"role": "assistant", "content": assistant_content})

        if not tool_uses:
            yield DoneEvent(text=full_text)
            return

        tool_result_blocks: list[dict[str, Any]] = []
        for tool_use in tool_uses:
            status_text = status_by_tool.get(tool_use.name)
            if status_text:
                yield StatusEvent(text=status_text)

            result, is_error = _run_tool(tool_use, handlers)

            if isinstance(result, ProposalReady):
                yield ProposalEvent(proposal=result.proposal)
                content_text = result.tool_result
            else:
                yield ToolResultEvent(
                    tool_name=tool_use.name, tool_use_id=tool_use.id, result=result
                )
                content_text = _result_to_text(result)

            block: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": content_text,
            }
            if is_error:
                block["is_error"] = True
            tool_result_blocks.append(block)

        conversation.append({"role": "user", "content": tool_result_blocks})

        if stop_reason != "tool_use":
            yield DoneEvent(text=full_text)
            return

    yield ErrorEvent(message="Reached the maximum number of tool calls for this turn.")
