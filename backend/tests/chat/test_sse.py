import json
from datetime import UTC, date, datetime

import pytest

from app.chat import service as chat_service
from app.chat.models import ChatTurn
from app.exceptions import RateLimited
from core.agents.tool_loop import ProposalReady
from core.llm.base import StreamStop, TextDelta, ToolUseRequest
from core.llm.fake import FakeLLMClient

CHAT_URL = "/api/v1/chat"


def _payload(text="How much did I spend this month?", month="2026-06"):
    return {
        "messages": [{"role": "user", "content": text}],
        "context": {"path": "/insights", "month": month},
    }


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        lines = block.splitlines()
        event = next(line.split(": ", 1)[1] for line in lines if line.startswith("event: "))
        data = next(line.split(": ", 1)[1] for line in lines if line.startswith("data: "))
        events.append((event, json.loads(data)))
    return events


def test_sse_event_order_status_text_proposal_done(chat_client, llm_holder):
    proposal = {"title": "Plan", "rows": [], "footer": ""}
    llm_holder["client"] = FakeLLMClient(
        stream_script=[
            [
                ToolUseRequest(id="1", name="get_month_summary", input={"month": "2026-06"}),
                StreamStop(reason="tool_use"),
            ],
            [
                ToolUseRequest(id="2", name="propose_budget_plan", input={"title": "x"}),
                StreamStop(reason="tool_use"),
            ],
            [TextDelta(text="Here is a plan."), StreamStop(reason="end_turn")],
        ]
    )
    import app.chat.service as service_module

    original = service_module._make_propose_budget_plan

    def _stub(db, user_id):
        return lambda args: ProposalReady(proposal=proposal)

    service_module._make_propose_budget_plan = _stub
    try:
        response = chat_client.post(CHAT_URL, json=_payload())
    finally:
        service_module._make_propose_budget_plan = original

    assert response.status_code == 200
    events = _parse_sse(response.text)
    kinds = [e[0] for e in events]

    assert kinds[0] == "status"
    assert "text" in kinds
    assert kinds.index("proposal") > kinds.index("status")
    assert kinds[-1] == "done"
    proposal_event = next(e for e in events if e[0] == "proposal")
    assert proposal_event[1] == proposal


def test_sse_provider_error_mid_stream_yields_error_event(chat_client, llm_holder):
    llm_holder["client"] = FakeLLMClient(stream_script=[RuntimeError("boom")])
    response = chat_client.post(CHAT_URL, json=_payload())
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events[0][0] == "error"


def test_chat_turn_is_recorded_even_on_provider_error(chat_client, llm_holder, db_session, user_id):
    llm_holder["client"] = FakeLLMClient(stream_script=[RuntimeError("boom")])
    chat_client.post(CHAT_URL, json=_payload())
    count = db_session.query(ChatTurn).filter(ChatTurn.user_id == user_id).count()
    assert count == 1


def test_chat_turn_is_committed_before_the_llm_is_ever_called(
    chat_client, llm_holder, db_session, user_id
):
    """Regression: the turn used to be recorded in the SSE generator's `finally`, so it was only
    committed after the whole (potentially long) stream finished, leaving a wide window where
    concurrent requests could all pass the rate-limit check. It must now be committed as part of
    the synchronous request handling, before the LLM is invoked at all."""
    calls = []

    class RecordingLLM:
        def stream_turn(self, system, messages, tools, max_tokens):
            # By the time the LLM is asked to stream, the turn must already be committed.
            calls.append(db_session.query(ChatTurn).filter(ChatTurn.user_id == user_id).count())
            yield from []

    llm_holder["client"] = RecordingLLM()
    chat_client.post(CHAT_URL, json=_payload())
    assert calls == [1]


def test_rate_limit_returns_429_before_streaming(
    chat_client, llm_holder, db_session, user_id, monkeypatch
):
    from config.llm import LLMSettings

    for _ in range(3):
        db_session.add(ChatTurn(user_id=user_id))
    db_session.commit()

    monkeypatch.setattr(
        "app.chat.router.get_llm_settings",
        lambda: LLMSettings(_env_file=None, provider="fake", chat_daily_limit=3),
    )
    response = chat_client.post(CHAT_URL, json=_payload())
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


def test_rate_limit_day_boundary_is_sgt_not_utc(monkeypatch, chat_client, db_session, user_id):
    already_sgt_tomorrow = datetime(2026, 6, 30, 20, 0, tzinfo=UTC)
    db_session.add(ChatTurn(user_id=user_id, created_at=already_sgt_tomorrow))
    db_session.commit()

    monkeypatch.setattr(chat_service, "today_sgt", lambda: date(2026, 7, 1))

    with pytest.raises(RateLimited):
        chat_service.check_rate_limit(db_session, user_id, daily_limit=1)


def test_grounding_logger_flags_fabricated_amount(monkeypatch):
    from core.agents.tool_loop import ToolResultEvent

    # `caplog` can't be used here: the session-scoped Alembic migration fixture runs
    # `fileConfig` (disable_existing_loggers=True), which disables any module logger already
    # created at collection time. Assert on the logger call directly instead.
    warnings: list[tuple[str, tuple]] = []
    monkeypatch.setattr(
        chat_service.logger, "warning", lambda msg, *args: warnings.append((msg, args))
    )

    tool_results = [
        ToolResultEvent(
            tool_name="get_month_summary",
            tool_use_id="1",
            result={"total": {"display": "S$100.00"}},
        )
    ]
    chat_service.check_grounding("You spent S$999.99 this month.", tool_results)

    assert len(warnings) == 1
    assert "grounding" in warnings[0][0].lower()


def test_grounding_logger_accepts_pairwise_sum(monkeypatch):
    from core.agents.tool_loop import ToolResultEvent

    warnings: list[tuple[str, tuple]] = []
    monkeypatch.setattr(
        chat_service.logger, "warning", lambda msg, *args: warnings.append((msg, args))
    )

    tool_results = [
        ToolResultEvent(
            tool_name="get_month_summary",
            tool_use_id="1",
            result={"a": {"display": "S$40.00"}, "b": {"display": "S$60.00"}},
        )
    ]
    chat_service.check_grounding("Combined that is S$100.00.", tool_results)

    assert warnings == []


def test_grounding_logger_flags_coincidental_sum_across_results(monkeypatch):
    from core.agents.tool_loop import ToolResultEvent

    warnings: list[tuple[str, tuple]] = []
    monkeypatch.setattr(
        chat_service.logger, "warning", lambda msg, *args: warnings.append((msg, args))
    )

    # S$40.00 and S$60.00 come from two different tool calls; their sum (S$100.00) must not be
    # treated as grounded just because it coincidentally matches a cross-result combination.
    tool_results = [
        ToolResultEvent(
            tool_name="get_month_summary", tool_use_id="1", result={"a": {"display": "S$40.00"}}
        ),
        ToolResultEvent(
            tool_name="get_category_breakdown",
            tool_use_id="2",
            result={"b": {"display": "S$60.00"}},
        ),
    ]
    chat_service.check_grounding("Combined that is S$100.00.", tool_results)

    assert len(warnings) == 1
    assert "grounding" in warnings[0][0].lower()
