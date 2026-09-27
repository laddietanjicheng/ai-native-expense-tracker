import json
import re
from collections.abc import Iterator
from typing import Any

from core.analytics.constants import VALID_CARD_TYPES
from core.analytics.formatting import fmt_money
from core.llm.base import LLMEvent, StreamStop, TextDelta, ToolSpec, ToolUseRequest
from core.prompts.insights import FACTS_MARKER

CARD_KINDS = VALID_CARD_TYPES - {"tip"}

_MONTH_RE = re.compile(r"\b\d{4}-\d{2}\b(?!-)")
_DEFAULT_TOOL_USE_ID = "fake-tool-1"


def _extract_facts(prompt: str) -> list[dict[str, Any]]:
    if FACTS_MARKER not in prompt:
        return []
    raw = prompt.split(FACTS_MARKER, 1)[1].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


def _card_for_fact(fact: dict[str, Any]) -> dict[str, Any]:
    kind = fact.get("kind", "tip")
    kind = kind if kind in CARD_KINDS else "tip"
    subject = fact.get("subject") or kind
    display = fact.get("display") or []
    return {
        "type": kind,
        "title": f"{kind.title()}: {subject}"[:60],
        "body": (f"{subject} — " + " vs ".join(display))[:240] if display else subject[:240],
        "fact_ids": [fact["id"]],
    }


def _extract_month(system: str) -> str | None:
    matches = _MONTH_RE.findall(system)
    return matches[-1] if matches else None


def _message_blocks(messages: list[dict[str, Any]], role: str) -> list[dict[str, Any]]:
    blocks = []
    for message in messages:
        if message.get("role") != role:
            continue
        content = message.get("content")
        if isinstance(content, list):
            blocks.extend(content)
    return blocks


def _requested_tool(messages: list[dict[str, Any]], tool_name: str) -> bool:
    return any(
        block.get("type") == "tool_use" and block.get("name") == tool_name
        for block in _message_blocks(messages, "assistant")
    )


def _tool_result_text(messages: list[dict[str, Any]], tool_use_id: str) -> str:
    for block in _message_blocks(messages, "user"):
        if block.get("type") == "tool_result" and block.get("tool_use_id") == tool_use_id:
            return str(block.get("content"))
    return "no data"


def _summary_sentence(result_text: str) -> str:
    """Turns `get_month_summary`'s JSON tool result into a short readable sentence, so local
    dev without an API key reads like an answer rather than raw JSON. Falls back to the raw
    result text if the shape is not what's expected."""
    try:
        data = json.loads(result_text)
    except (json.JSONDecodeError, TypeError):
        return f"Based on your month so far: {result_text}"

    total = data.get("total") if isinstance(data, dict) else None
    if not isinstance(total, dict) or not isinstance(total.get("display"), str):
        return f"Based on your month so far: {result_text}"

    sentence = f"You've spent {total['display']} so far this month"
    delta_prev = data.get("delta_vs_prev")
    if isinstance(delta_prev, dict) and isinstance(delta_prev.get("cents"), int):
        cents = delta_prev["cents"]
        if cents != 0:
            direction = "more" if cents > 0 else "less"
            sentence += f", {fmt_money(abs(cents))} {direction} than last month"
    sentence += "."

    projected = data.get("projected")
    if isinstance(projected, dict) and isinstance(projected.get("display"), str):
        sentence += f" At this pace you'd finish around {projected['display']}."

    return sentence


class FakeLLMClient:
    """Deterministic LLMClient for tests and keyless local dev.

    With no scripted responses, it derives valid cards straight from the facts pack embedded
    in the prompt, so local dev without an API key still shows working insight cards. Tests
    can instead pass `responses` to script exact outputs, e.g. to exercise the narration
    validator's retry and failure paths.
    """

    def __init__(
        self,
        responses: list[dict[str, Any]] | None = None,
        stream_script: list[list[LLMEvent]] | None = None,
    ) -> None:
        self._responses = list(responses) if responses is not None else None
        self._stream_script = list(stream_script) if stream_script is not None else None
        self._stream_calls = 0

    def generate_structured(
        self, system: str, prompt: str, schema: dict[str, Any], tool_name: str
    ) -> dict[str, Any]:
        if self._responses is not None:
            if not self._responses:
                raise RuntimeError("FakeLLMClient has no more scripted responses")
            return self._responses.pop(0)

        facts = _extract_facts(prompt)
        cards = [_card_for_fact(fact) for fact in facts[:5]]
        return {"cards": cards}

    def stream_turn(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Iterator[LLMEvent]:
        """Scriptable for tests via `stream_script`. With no script, plays a short canned turn
        that calls `get_month_summary` once and then states the numbers it returned, so local
        dev without an API key still shows a working chat."""
        self._stream_calls += 1
        if self._stream_script is not None:
            if not self._stream_script:
                raise RuntimeError("FakeLLMClient has no more scripted stream turns")
            yield from self._stream_script.pop(0)
            return

        if not _requested_tool(messages, "get_month_summary"):
            month = _extract_month(system)
            yield ToolUseRequest(
                id=_DEFAULT_TOOL_USE_ID, name="get_month_summary", input={"month": month}
            )
            yield StreamStop(reason="tool_use")
            return

        result_text = _tool_result_text(messages, _DEFAULT_TOOL_USE_ID)
        yield TextDelta(text=_summary_sentence(result_text))
        yield StreamStop(reason="end_turn")
