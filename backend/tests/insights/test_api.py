import json
from datetime import date

from app.expenses.models import Expense
from app.insights import service as insights_service
from app.shared.dates import add_months
from core.analytics.facts import build_facts_pack
from core.analytics.pipeline import run_detectors
from core.analytics.ranking import rank_candidates
from core.llm.fake import FakeLLMClient
from core.prompts.insights import render_insights_prompt


def _add_expense(db_session, user_id, category, amount_cents, expense_date, note=None):
    db_session.add(
        Expense(
            user_id=user_id,
            category_id=category.id,
            amount_cents=amount_cents,
            expense_date=expense_date,
            note=note,
        )
    )
    db_session.commit()


def test_get_insights_rejects_bad_month_format(insights_client):
    response = insights_client.get("/api/v1/insights", params={"month": "2026/09"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_get_insights_rejects_future_month(insights_client):
    response = insights_client.get("/api/v1/insights", params={"month": "2099-01"})
    assert response.status_code == 422


def test_get_insights_returns_summary_without_narration_when_none_generated(
    insights_client, db_session, categories, user_id
):
    _add_expense(db_session, user_id, categories["Other"], 5_000, date(2026, 6, 10))
    response = insights_client.get("/api/v1/insights", params={"month": "2026-06"})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["summary"]["total_cents"] == 5_000
    assert body["narration"] is None
    assert body["is_stale"] is False


def test_generate_narration_requires_data_in_month_and_previous(
    insights_client, db_session, categories, user_id
):
    _add_expense(db_session, user_id, categories["Other"], 5_000, date(2026, 6, 10))
    response = insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NOT_ENOUGH_DATA"


def test_generate_narration_succeeds_and_caches(insights_client, db_session, categories, user_id):
    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))

    response = insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["narration"] is not None
    assert body["narration"]["model"] == "claude-sonnet-5"
    assert len(body["narration"]["cards"]) <= 5

    cached = insights_client.get("/api/v1/insights", params={"month": "2026-06"})
    assert cached.json()["data"]["narration"] is not None
    assert cached.json()["data"]["is_stale"] is False


def test_narration_becomes_stale_when_facts_change(
    insights_client, db_session, categories, user_id
):
    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))
    insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})

    _add_expense(db_session, user_id, categories["Other"], 50_000, date(2026, 6, 11))

    response = insights_client.get("/api/v1/insights", params={"month": "2026-06"})
    assert response.json()["data"]["is_stale"] is True


def test_narration_never_leaks_notes(insights_client, db_session, categories, user_id):
    secret = "SUPER_SECRET_NOTE_TOKEN"
    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10), note=secret)
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10), note=secret)

    response = insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})
    assert secret not in json.dumps(response.json())

    fetched = insights_client.get("/api/v1/insights", params={"month": "2026-06"})
    assert secret not in json.dumps(fetched.json())


def test_rate_limit_blocks_after_daily_limit(db_session, categories, user_id):
    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))
    llm = FakeLLMClient()

    insights_service.generate_narration(
        db_session, user_id, date(2026, 6, 1), llm, daily_limit=1, model_name="fake"
    )

    import pytest

    from app.exceptions import RateLimited

    with pytest.raises(RateLimited):
        insights_service.generate_narration(
            db_session, user_id, date(2026, 6, 1), llm, daily_limit=1, model_name="fake"
        )


def test_no_note_ever_leaks_across_detectors(insights_client, db_session, categories, user_id):
    """One dataset engineered to fire most detectors (D2-D10); every expense carries the same
    marker note, so if any detector ever surfaced a note the marker would appear somewhere."""
    marker = "SUPER_SECRET_NOTE_MARKER_TOKEN"
    food, groceries, dining, coffee = (
        categories["Food"],
        categories["Groceries"],
        categories["Dining Out"],
        categories["Coffee & Snacks"],
    )
    other = categories["Other"]
    month = date(2026, 6, 1)

    def add(category, amount, day, sub=None, month_offset=0):
        d = add_months(month, month_offset).replace(day=day)
        db_session.add(
            Expense(
                user_id=user_id,
                category_id=category.id,
                sub_category_id=sub.id if sub else None,
                amount_cents=amount,
                expense_date=d,
                note=marker,
            )
        )

    # D2 change: Groceries jumps this month vs last.
    add(food, 3_000, 10, groceries, -1)
    add(food, 10_000, 10, groceries, 0)
    # D3 leak: many small Coffee & Snacks purchases this month.
    for day in range(1, 9):
        add(food, 1_000, day, coffee, 0)
    # D4 recurring: same Dining Out amount 3 months running (note-matched).
    for offset in (-2, -1, 0):
        add(food, 2_000, 12, dining, offset)
    # D6 trend: Food total rising across 4 months (add on top of the above).
    add(food, 5_000, 20, groceries, -3)
    add(food, 8_000, 20, groceries, -2)
    add(food, 9_000, 20, groceries, -1)
    add(food, 40_000, 20, groceries, 0)
    # D8 duplicate + outlier.
    add(food, 4_242, 15, groceries, 0)
    add(food, 4_242, 15, groceries, 0)
    # D9/D10: Other bucket share.
    add(other, 6_000, 5, month_offset=0)
    db_session.commit()

    ledger = insights_service.load_ledger(db_session, user_id, month)
    candidates = run_detectors(ledger)
    ranked = rank_candidates(candidates, ledger.is_current_month, [])
    facts = build_facts_pack(ranked)
    assert marker not in json.dumps(facts)

    prompt = render_insights_prompt(
        [{k: v for k, v in f.items() if not k.startswith("_")} for f in facts]
    )
    assert marker not in prompt

    response = insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})
    assert response.status_code == 200
    assert marker not in json.dumps(response.json())

    stored = insights_service._stored_report(db_session, user_id, month)
    assert marker not in json.dumps(stored.cards)

    fetched = insights_client.get("/api/v1/insights", params={"month": "2026-06"})
    assert marker not in json.dumps(fetched.json())


def test_rate_limit_day_boundary_is_sgt_not_utc(monkeypatch, db_session, categories, user_id):
    from datetime import UTC, datetime

    import pytest

    from app.exceptions import RateLimited
    from app.insights.models import InsightGeneration

    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))

    # 2026-06-30 20:00 UTC is already 2026-07-01 04:00 in Singapore: a UTC-midnight boundary
    # would miss this row (still "the 30th" in UTC) and wrongly allow one more generation.
    already_sgt_tomorrow = datetime(2026, 6, 30, 20, 0, tzinfo=UTC)
    db_session.add(InsightGeneration(user_id=user_id, created_at=already_sgt_tomorrow))
    db_session.commit()

    monkeypatch.setattr(insights_service, "today_sgt", lambda: date(2026, 7, 1))
    llm = FakeLLMClient()

    with pytest.raises(RateLimited):
        insights_service.generate_narration(
            db_session, user_id, date(2026, 6, 1), llm, daily_limit=1, model_name="fake"
        )


def test_ai_unavailable_after_failed_retry(db_session, categories, user_id):
    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))
    llm = FakeLLMClient(
        responses=[
            {"cards": [{"type": "change", "title": "x", "body": "S$999.99", "fact_ids": ["F1"]}]}
        ]
        * 2
    )

    import pytest

    from app.exceptions import AiUnavailable

    with pytest.raises(AiUnavailable):
        insights_service.generate_narration(
            db_session, user_id, date(2026, 6, 1), llm, daily_limit=20, model_name="fake"
        )


class _RaisingLLM:
    """Stands in for a provider transport/quota failure (network error, Gemini 429, Anthropic
    API error): `generate_structured` never returns, it always raises."""

    def generate_structured(self, system, prompt, schema, tool_name):
        raise RuntimeError("simulated provider transport failure")


def test_provider_exception_becomes_ai_unavailable_not_a_500(db_session, categories, user_id):
    import pytest

    from app.exceptions import AiUnavailable

    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))

    with pytest.raises(AiUnavailable):
        insights_service.generate_narration(
            db_session, user_id, date(2026, 6, 1), _RaisingLLM(), daily_limit=20, model_name="fake"
        )


def test_provider_exception_via_api_returns_503(insights_client, db_session, categories, user_id):
    from core.llm.factory import get_llm_client

    _add_expense(db_session, user_id, categories["Other"], 12_000, date(2026, 6, 10))
    _add_expense(db_session, user_id, categories["Other"], 6_500, date(2026, 5, 10))

    insights_client.app.dependency_overrides[get_llm_client] = lambda: _RaisingLLM()
    try:
        response = insights_client.post("/api/v1/insights/narration", params={"month": "2026-06"})
    finally:
        insights_client.app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient()

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"
