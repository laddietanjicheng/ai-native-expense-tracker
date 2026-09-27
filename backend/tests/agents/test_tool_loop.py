import pytest

from core.agents.tool_loop import (
    DoneEvent,
    ErrorEvent,
    ProposalEvent,
    ProposalReady,
    StatusEvent,
    TextEvent,
    ToolResultEvent,
    run_tool_loop,
)
from core.llm.base import StreamStop, TextDelta, ToolSpec, ToolUseRequest


class ScriptedLLM:
    """Yields one scripted round of events per `stream_turn` call."""

    def __init__(self, rounds):
        self.rounds = list(rounds)
        self.calls = 0

    def stream_turn(self, system, messages, tools, max_tokens):
        self.calls += 1
        if not self.rounds:
            raise AssertionError("ScriptedLLM has no more rounds")
        events = self.rounds.pop(0)
        if isinstance(events, Exception):
            raise events
        yield from events


def _tool(name: str, status: str = "Working…") -> ToolSpec:
    return ToolSpec(name=name, description="d", input_schema={"type": "object"}, status_text=status)


def test_single_round_answer_with_no_tool_use():
    llm = ScriptedLLM([[TextDelta(text="Hello."), StreamStop(reason="end_turn")]])
    events = list(run_tool_loop(llm, "sys", [], [], {}, max_tokens=100))
    assert events == [TextEvent(text="Hello."), DoneEvent(text="Hello.")]


def test_multi_round_tool_call_then_answer():
    llm = ScriptedLLM(
        [
            [ToolUseRequest(id="1", name="get_x", input={}), StreamStop(reason="tool_use")],
            [TextDelta(text="It is 5."), StreamStop(reason="end_turn")],
        ]
    )
    handlers = {"get_x": lambda args: {"value": 5}}
    events = list(run_tool_loop(llm, "sys", [], [_tool("get_x", "Looking…")], handlers, 100))

    assert events[0] == StatusEvent(text="Looking…")
    assert events[1] == ToolResultEvent(tool_name="get_x", tool_use_id="1", result={"value": 5})
    assert events[2] == TextEvent(text="It is 5.")
    assert events[3] == DoneEvent(text="It is 5.")
    assert llm.calls == 2


def test_handler_exception_is_fed_back_not_raised():
    llm = ScriptedLLM(
        [
            [ToolUseRequest(id="1", name="boom", input={}), StreamStop(reason="tool_use")],
            [TextDelta(text="Sorted."), StreamStop(reason="end_turn")],
        ]
    )

    def boom(_args):
        raise ValueError("kaboom")

    events = list(run_tool_loop(llm, "sys", [], [_tool("boom")], {"boom": boom}, 100))
    result_event = next(e for e in events if isinstance(e, ToolResultEvent))
    assert "kaboom" in result_event.result
    assert events[-1] == DoneEvent(text="Sorted.")


def test_unknown_tool_is_fed_back_as_error():
    llm = ScriptedLLM(
        [
            [ToolUseRequest(id="1", name="nope", input={}), StreamStop(reason="tool_use")],
            [TextDelta(text="ok"), StreamStop(reason="end_turn")],
        ]
    )
    events = list(run_tool_loop(llm, "sys", [], [], {}, 100))
    result_event = next(e for e in events if isinstance(e, ToolResultEvent))
    assert "Unknown tool: nope" in result_event.result


def test_six_round_cap_yields_error():
    rounds = [
        [ToolUseRequest(id=str(i), name="loop", input={}), StreamStop(reason="tool_use")]
        for i in range(10)
    ]
    llm = ScriptedLLM(rounds)
    events = list(run_tool_loop(llm, "sys", [], [_tool("loop")], {"loop": lambda a: "ok"}, 100))
    assert llm.calls == 6
    assert isinstance(events[-1], ErrorEvent)
    assert "maximum number of tool calls" in events[-1].message


def test_proposal_ready_emits_proposal_event_and_generic_ack():
    proposal = {"title": "Plan", "rows": [], "footer": ""}
    llm = ScriptedLLM(
        [
            [ToolUseRequest(id="1", name="propose", input={}), StreamStop(reason="tool_use")],
            [TextDelta(text="Here is a plan."), StreamStop(reason="end_turn")],
        ]
    )
    handlers = {"propose": lambda a: ProposalReady(proposal=proposal)}
    events = list(run_tool_loop(llm, "sys", [], [_tool("propose")], handlers, 100))

    proposal_events = [e for e in events if isinstance(e, ProposalEvent)]
    assert proposal_events == [ProposalEvent(proposal=proposal)]
    assert not any(isinstance(e, ToolResultEvent) for e in events)


def test_provider_stream_failure_mid_turn_yields_error_and_stops():
    llm = ScriptedLLM([RuntimeError("network down")])
    events = list(run_tool_loop(llm, "sys", [], [], {}, 100))
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert llm.calls == 1


@pytest.mark.parametrize("stop_reason", ["end_turn", "max_tokens", "other"])
def test_tool_use_with_non_tool_use_stop_reason_still_ends_turn(stop_reason):
    llm = ScriptedLLM(
        [[ToolUseRequest(id="1", name="get_x", input={}), StreamStop(reason=stop_reason)]]
    )
    events = list(run_tool_loop(llm, "sys", [], [_tool("get_x")], {"get_x": lambda a: "ok"}, 100))
    assert isinstance(events[-1], DoneEvent)
    assert llm.calls == 1
