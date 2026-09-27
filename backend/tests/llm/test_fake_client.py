import json

import pytest

from core.llm.base import StreamStop, TextDelta, ToolUseRequest
from core.llm.fake import FakeLLMClient
from core.prompts.chat import render_chat_system
from core.prompts.insights import render_insights_prompt

FACTS = [
    {"id": "F1", "kind": "change", "subject": "Food", "display": ["S$96.40", "12%"]},
    {"id": "F2", "kind": "leak", "subject": "Coffee", "display": ["S$50.00"]},
]


def test_default_response_builds_one_card_per_fact():
    client = FakeLLMClient()
    prompt = render_insights_prompt(FACTS)
    result = client.generate_structured("system", prompt, {}, "write_insight_cards")
    assert len(result["cards"]) == 2
    assert result["cards"][0]["fact_ids"] == ["F1"]
    assert "S$96.40" in result["cards"][0]["body"]


def test_default_response_with_no_facts_returns_no_cards():
    client = FakeLLMClient()
    result = client.generate_structured("system", "no facts here", {}, "write_insight_cards")
    assert result["cards"] == []


def test_scripted_responses_are_returned_in_order():
    client = FakeLLMClient(responses=[{"cards": []}, {"cards": [{"a": 1}]}])
    first = client.generate_structured("s", "p", {}, "t")
    second = client.generate_structured("s", "p", {}, "t")
    assert first == {"cards": []}
    assert second == {"cards": [{"a": 1}]}


def test_scripted_responses_raise_once_exhausted():
    client = FakeLLMClient(responses=[{"cards": []}])
    client.generate_structured("s", "p", {}, "t")
    with pytest.raises(RuntimeError):
        client.generate_structured("s", "p", {}, "t")


def test_default_stream_turn_calls_get_month_summary_first():
    client = FakeLLMClient()
    system = render_chat_system("2026-09-27", "SGD", "/insights", "2026-09")
    events = list(client.stream_turn(system, [], [], 1500))
    assert events == [
        ToolUseRequest(id="fake-tool-1", name="get_month_summary", input={"month": "2026-09"}),
        StreamStop(reason="tool_use"),
    ]


def _tool_result_message(content: str) -> dict:
    return {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "fake-tool-1", "content": content}],
    }


_TOOL_USE_MESSAGE = {
    "role": "assistant",
    "content": [
        {"type": "tool_use", "id": "fake-tool-1", "name": "get_month_summary", "input": {}}
    ],
}


def test_default_stream_turn_answers_with_readable_sentence_after_round_two():
    client = FakeLLMClient()
    system = render_chat_system("2026-09-27", "SGD", "/insights", "2026-09")
    result = json.dumps(
        {
            "total": {"cents": 80_140, "display": "S$801.40"},
            "delta_vs_prev": {"cents": 19_476, "display": "S$194.76"},
            "projected": {"cents": 89_044, "display": "S$890.44"},
        }
    )
    messages = [
        {"role": "user", "content": [{"type": "text", "text": "How much did I spend?"}]},
        _TOOL_USE_MESSAGE,
        _tool_result_message(result),
    ]
    events = list(client.stream_turn(system, messages, [], 1500))
    assert events == [
        TextDelta(
            text="You've spent S$801.40 so far this month, S$194.76 more than last month. "
            "At this pace you'd finish around S$890.44."
        ),
        StreamStop(reason="end_turn"),
    ]


def test_default_stream_turn_sentence_handles_a_decrease_and_no_projection():
    client = FakeLLMClient()
    system = render_chat_system("2026-09-27", "SGD", "/insights", "2026-09")
    result = json.dumps(
        {
            "total": {"cents": 50_000, "display": "S$500.00"},
            "delta_vs_prev": {"cents": -10_000, "display": "-S$100.00"},
            "projected": None,
        }
    )
    messages = [
        {"role": "user", "content": [{"type": "text", "text": "How much did I spend?"}]},
        _TOOL_USE_MESSAGE,
        _tool_result_message(result),
    ]
    events = list(client.stream_turn(system, messages, [], 1500))
    assert events[0] == TextDelta(
        text="You've spent S$500.00 so far this month, S$100.00 less than last month."
    )


def test_default_stream_turn_sentence_falls_back_when_shape_is_unexpected():
    client = FakeLLMClient()
    system = render_chat_system("2026-09-27", "SGD", "/insights", "2026-09")
    messages = [
        {"role": "user", "content": [{"type": "text", "text": "How much did I spend?"}]},
        _TOOL_USE_MESSAGE,
        _tool_result_message("not json"),
    ]
    events = list(client.stream_turn(system, messages, [], 1500))
    assert events[0] == TextDelta(text="Based on your month so far: not json")


def test_stream_script_is_played_in_order():
    round_one = [TextDelta(text="hi"), StreamStop(reason="end_turn")]
    client = FakeLLMClient(stream_script=[round_one])
    assert list(client.stream_turn("s", [], [], 100)) == round_one
    with pytest.raises(RuntimeError):
        list(client.stream_turn("s", [], [], 100))
