"""Spending chat: tool specs, tool handlers (reusing insights/budgets services) and the SSE
turn runner (spec §6.1). No tool ever returns a note."""

import json
import logging
import uuid
from collections.abc import Iterator
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.budgets import service as budgets_service
from app.budgets.schemas import MAX_AMOUNT_CENTS as BUDGET_MAX_AMOUNT_CENTS
from app.chat.models import ChatTurn
from app.chat.schemas import ChatMessage, ChatRequest
from app.exceptions import RateLimited
from app.expenses.models import Expense
from app.insights import service as insights_service
from app.shared.dates import SGT, month_start, parse_month_param, today_sgt
from core.agents.tool_loop import (
    AgentEvent,
    DoneEvent,
    ProposalReady,
    TextEvent,
    ToolResultEvent,
    run_tool_loop,
)
from core.analytics.facts import public_fact
from core.analytics.formatting import extract_number_tokens, fmt_money
from core.llm.base import LLMClient, ToolSpec
from core.prompts.chat import render_chat_system

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 1500
LIST_EXPENSES_MAX_LIMIT = 50
CURRENCY = "SGD"


# ---------------------------------------------------------------------------
# Rate limiting (spec §6.1: 60 turns per user per SGT day)
# ---------------------------------------------------------------------------


def _sgt_midnight_today() -> datetime:
    today = today_sgt()
    return datetime(today.year, today.month, today.day, tzinfo=SGT)


def check_rate_limit(db: Session, user_id: uuid.UUID, daily_limit: int) -> None:
    day_start = _sgt_midnight_today()
    stmt = (
        select(func.count())
        .select_from(ChatTurn)
        .where(ChatTurn.user_id == user_id, ChatTurn.created_at >= day_start)
    )
    if db.execute(stmt).scalar_one() >= daily_limit:
        raise RateLimited()


def record_chat_turn(db: Session, user_id: uuid.UUID) -> None:
    db.add(ChatTurn(user_id=user_id))
    db.commit()


# ---------------------------------------------------------------------------
# Small display helpers shared by every tool payload
# ---------------------------------------------------------------------------


def _money(cents: int) -> dict[str, Any]:
    return {"cents": cents, "display": fmt_money(cents)}


def _pct(percent: float | None) -> str | None:
    """`summary.delta_vs_*_pct` are already percentages (e.g. 32.1 for 32%), unlike `fmt_pct`
    (core/analytics/formatting.py), which takes a 0-1 ratio -- so this formats directly rather
    than calling `fmt_pct` and multiplying by 100 twice."""
    return None if percent is None else f"{round(percent):g}%"


def _parse_month(args: dict[str, Any]) -> date | str:
    month_str = args.get("month")
    if not month_str:
        return "Error: 'month' is required, in YYYY-MM format."
    try:
        return parse_month_param(month_str)
    except ValueError:
        return f"Error: invalid month '{month_str}', expected YYYY-MM."


def _parse_uuid(raw: Any, label: str) -> uuid.UUID | str:
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        return f"Error: invalid {label} '{raw}'."


# ---------------------------------------------------------------------------
# Read-only tool handlers
# ---------------------------------------------------------------------------


def _summary_payload(summary) -> dict[str, Any]:
    return {
        "total": _money(summary.total_cents),
        "prev_total": _money(summary.prev_total_cents),
        "delta_vs_prev": _money(summary.delta_vs_prev_cents),
        "delta_vs_prev_pct": _pct(summary.delta_vs_prev_pct),
        "avg3": _money(summary.avg3_cents),
        "delta_vs_avg3": _money(summary.delta_vs_avg3_cents),
        "delta_vs_avg3_pct": _pct(summary.delta_vs_avg3_pct),
        "projected": _money(summary.projected_cents)
        if summary.projected_cents is not None
        else None,
        "days_elapsed": summary.days_elapsed,
        "days_in_month": summary.days_in_month,
    }


def _make_get_month_summary(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> dict[str, Any] | str:
        month = _parse_month(args)
        if isinstance(month, str):
            return month
        ledger = insights_service.load_ledger(db, user_id, month)
        return _summary_payload(insights_service.build_summary(ledger))

    return handler


def _change_payload(change) -> dict[str, Any]:
    return {
        "category_id": str(change.category_id),
        "name": change.name,
        "now": _money(change.now_cents),
        "prev": _money(change.prev_cents),
        "delta": _money(change.delta_cents),
        "sub_categories": [
            {
                "category_id": str(sub.category_id),
                "name": sub.name,
                "now": _money(sub.now_cents),
                "prev": _money(sub.prev_cents),
                "delta": _money(sub.delta_cents),
            }
            for sub in change.sub_categories
        ],
    }


def _make_get_category_breakdown(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> dict[str, Any] | str:
        month = _parse_month(args)
        if isinstance(month, str):
            return month
        category_filter = None
        if args.get("category_id"):
            category_filter = _parse_uuid(args["category_id"], "category_id")
            if isinstance(category_filter, str):
                return category_filter

        ledger = insights_service.load_ledger(db, user_id, month)
        changes = insights_service.build_changes(ledger)
        if category_filter is not None:
            changes = [c for c in changes if c.category_id == category_filter]
            if not changes:
                return f"Error: category '{args['category_id']}' has no data for this user."
        return {"categories": [_change_payload(c) for c in changes]}

    return handler


def _period_totals_by_category(
    db: Session, user_id: uuid.UUID, date_from: date, date_to: date
) -> dict[uuid.UUID, int]:
    stmt = (
        select(Expense.category_id, func.coalesce(func.sum(Expense.amount_cents), 0))
        .where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None),
            Expense.expense_date >= date_from,
            Expense.expense_date <= date_to,
        )
        .group_by(Expense.category_id)
    )
    return {row[0]: int(row[1]) for row in db.execute(stmt).all()}


MAX_PERIOD_DAYS = 366


def _validate_period(from_: date, to_: date, label: str) -> str | None:
    if to_ < from_:
        return f"Error: period {label}'s 'to' date must be on or after its 'from' date."
    if (to_ - from_).days + 1 > MAX_PERIOD_DAYS:
        return f"Error: period {label} spans more than {MAX_PERIOD_DAYS} days; narrow the range."
    return None


def _parse_period_dates(args: dict[str, Any]) -> tuple[date, date, date, date] | str:
    try:
        a_from = date.fromisoformat(args["a_from"])
        a_to = date.fromisoformat(args["a_to"])
        b_from = date.fromisoformat(args["b_from"])
        b_to = date.fromisoformat(args["b_to"])
    except (KeyError, TypeError, ValueError):
        return "Error: a_from, a_to, b_from, b_to are all required dates (YYYY-MM-DD)."
    error = _validate_period(a_from, a_to, "a") or _validate_period(b_from, b_to, "b")
    if error:
        return error
    return a_from, a_to, b_from, b_to


def _make_compare_periods(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> dict[str, Any] | str:
        parsed = _parse_period_dates(args)
        if isinstance(parsed, str):
            return parsed
        a_from, a_to, b_from, b_to = parsed

        names = {c.id: c.name for c in budgets_service.active_top_level_categories(db, user_id)}
        a_totals = _period_totals_by_category(db, user_id, a_from, a_to)
        b_totals = _period_totals_by_category(db, user_id, b_from, b_to)

        rows = []
        for category_id, name in names.items():
            a_cents = a_totals.get(category_id, 0)
            b_cents = b_totals.get(category_id, 0)
            if not a_cents and not b_cents:
                continue
            rows.append(
                {
                    "category_id": str(category_id),
                    "name": name,
                    "period_a": _money(a_cents),
                    "period_b": _money(b_cents),
                    "delta": _money(b_cents - a_cents),
                }
            )
        rows.sort(key=lambda r: r["name"].lower())
        return {"categories": rows}

    return handler


def _expense_payload(expense: Expense) -> dict[str, Any]:
    return {
        "date": expense.expense_date.isoformat(),
        "amount": _money(expense.amount_cents),
        "category": expense.category.name,
        "sub_category": expense.sub_category.name if expense.sub_category else None,
    }


def _make_list_expenses(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> dict[str, Any] | str:
        try:
            date_from = date.fromisoformat(args["date_from"])
            date_to = date.fromisoformat(args["date_to"])
        except (KeyError, TypeError, ValueError):
            return "Error: date_from and date_to are required dates (YYYY-MM-DD)."
        if date_to < date_from:
            return "Error: date_to must be on or after date_from."

        limit = min(int(args.get("limit") or LIST_EXPENSES_MAX_LIMIT), LIST_EXPENSES_MAX_LIMIT)
        if limit <= 0:
            return "Error: limit must be a positive integer."

        conditions = [
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None),
            Expense.expense_date >= date_from,
            Expense.expense_date <= date_to,
        ]
        if args.get("category_id"):
            category_id = _parse_uuid(args["category_id"], "category_id")
            if isinstance(category_id, str):
                return category_id
            conditions.append(Expense.category_id == category_id)
        if args.get("min_amount_cents") is not None:
            conditions.append(Expense.amount_cents >= int(args["min_amount_cents"]))

        stmt = (
            select(Expense)
            .options(joinedload(Expense.category), joinedload(Expense.sub_category))
            .where(*conditions)
            .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .limit(limit)
        )
        rows = db.execute(stmt).unique().scalars().all()
        return {"expenses": [_expense_payload(r) for r in rows]}

    return handler


def _budget_row_payload(row, progress_by_category: dict) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "category_id": str(row.category_id),
        "name": row.name,
        "cap": _money(row.amount_cents) if row.amount_cents is not None else None,
        "avg3": _money(row.avg3_cents),
    }
    progress = progress_by_category.get(row.category_id)
    if row.amount_cents is not None and progress is not None:
        payload["spent"] = _money(progress.spent_cents)
        payload["pct_used"] = progress.pct
        payload["status"] = progress.status
    return payload


def _make_get_budgets(db: Session, user_id: uuid.UUID):
    def handler(_args: dict[str, Any]) -> dict[str, Any]:
        budgets_out = budgets_service.build_budgets_out(db, user_id)
        ledger = insights_service.load_ledger(db, user_id, month_start(today_sgt()))
        progress_by_category = {
            p.category_id: p for p in insights_service.build_budget_progress(ledger)
        }

        overall = None
        overall_progress = progress_by_category.get(None)
        if budgets_out.overall_cents is not None and overall_progress is not None:
            overall = {
                "cap": _money(budgets_out.overall_cents),
                "spent": _money(overall_progress.spent_cents),
                "pct_used": overall_progress.pct,
                "status": overall_progress.status,
            }
        return {
            "overall": overall,
            "categories": [
                _budget_row_payload(r, progress_by_category) for r in budgets_out.categories
            ],
        }

    return handler


def _make_get_insights(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> dict[str, Any] | str:
        month = _parse_month(args)
        if isinstance(month, str):
            return month
        ledger = insights_service.load_ledger(db, user_id, month)
        _ranked, facts = insights_service.ranked_facts(db, user_id, ledger)
        return {"facts": [public_fact(f) for f in facts]}

    return handler


# ---------------------------------------------------------------------------
# propose_budget_plan: validates, never writes; the caller Applies via PATCH /budgets
# ---------------------------------------------------------------------------


def _parse_proposal_rows(
    rows_in: Any, categories_by_id: dict
) -> list[tuple[uuid.UUID, int, str | None]] | str:
    if not isinstance(rows_in, list):
        return "Error: 'rows' must be a list."
    rows = []
    seen_category_ids: set[uuid.UUID] = set()
    for row in rows_in:
        category_id = _parse_uuid(row.get("category_id"), "category_id")
        if isinstance(category_id, str):
            return category_id
        category = categories_by_id.get(category_id)
        if category is None:
            return (
                f"Error: '{row.get('category_id')}' is not one of the user's "
                "active top-level categories."
            )
        if category_id in seen_category_ids:
            return (
                f"Error: '{category.name}' appears more than once in rows; "
                "each category can only appear once."
            )
        seen_category_ids.add(category_id)
        amount = row.get("amount_cents")
        if not isinstance(amount, int) or not (0 < amount <= BUDGET_MAX_AMOUNT_CENTS):
            return (
                f"Error: amount_cents for '{category.name}' must be a whole number of cents "
                f"between 1 and {BUDGET_MAX_AMOUNT_CENTS}."
            )
        rows.append((category_id, amount, row.get("reason")))
    return rows


def _check_overall_allocation(
    db: Session,
    user_id: uuid.UUID,
    categories: list,
    rows: list[tuple[uuid.UUID, int, str | None]],
    overall_cents: Any,
) -> str | None:
    if not isinstance(overall_cents, int) or not (0 < overall_cents <= BUDGET_MAX_AMOUNT_CENTS):
        return (
            "Error: overall_cents is required and must be a valid amount "
            "when allocates_overall is true."
        )
    touched_ids = {category_id for category_id, _, _ in rows}
    existing_cents = 0
    for category in categories:
        if category.id in touched_ids:
            continue
        existing = budgets_service.active_budget(db, user_id, category.id)
        if existing is not None:
            existing_cents += existing.amount_cents
    total = existing_cents + sum(amount for _, amount, _ in rows)
    if total != overall_cents:
        return (
            f"Error: rows plus unchanged category budgets add up to {fmt_money(total)}, not "
            f"{fmt_money(overall_cents)}. They must add up exactly when allocating "
            "the overall budget."
        )
    return None


def _build_proposal(
    db: Session,
    user_id: uuid.UUID,
    title: str,
    rows: list[tuple[uuid.UUID, int, str | None]],
    categories_by_id: dict,
    overall_cents: int | None,
    allocates_overall: bool,
) -> dict[str, Any]:
    proposal_rows = []
    if overall_cents is not None:
        existing_overall = budgets_service.active_budget(db, user_id, None)
        proposal_rows.append(
            {
                "category_id": None,
                "name": "Overall",
                "from_cents": existing_overall.amount_cents if existing_overall else None,
                "to_cents": overall_cents,
                "reason": None,
            }
        )
    for category_id, amount, reason in rows:
        existing = budgets_service.active_budget(db, user_id, category_id)
        proposal_rows.append(
            {
                "category_id": str(category_id),
                "name": categories_by_id[category_id].name,
                "from_cents": existing.amount_cents if existing else None,
                "to_cents": amount,
                "reason": reason,
            }
        )
    footer = f"Adds up to {fmt_money(overall_cents)}" if allocates_overall else ""
    return {"title": title, "rows": proposal_rows, "footer": footer}


def _make_propose_budget_plan(db: Session, user_id: uuid.UUID):
    def handler(args: dict[str, Any]) -> ProposalReady | str:
        title = args.get("title")
        if not title or not isinstance(title, str):
            return "Error: 'title' is required."

        categories = budgets_service.active_top_level_categories(db, user_id)
        categories_by_id = {c.id: c for c in categories}

        rows = _parse_proposal_rows(args.get("rows", []), categories_by_id)
        if isinstance(rows, str):
            return rows

        allocates_overall = bool(args.get("allocates_overall", False))
        overall_cents = args.get("overall_cents")
        if allocates_overall:
            error = _check_overall_allocation(db, user_id, categories, rows, overall_cents)
            if error:
                return error

        proposal = _build_proposal(
            db, user_id, title, rows, categories_by_id, overall_cents, allocates_overall
        )
        return ProposalReady(proposal=proposal)

    return handler


# ---------------------------------------------------------------------------
# Tool specs + handler registry
# ---------------------------------------------------------------------------


def build_tool_specs() -> list[ToolSpec]:
    month_schema = {"type": "string", "pattern": r"^\d{4}-\d{2}$"}
    return [
        ToolSpec(
            name="get_month_summary",
            description=(
                "Totals, previous month, 3-month average, projection and days elapsed "
                "for one month."
            ),
            input_schema={
                "type": "object",
                "properties": {"month": month_schema},
                "required": ["month"],
            },
            status_text="Looking at your month's totals…",
        ),
        ToolSpec(
            name="get_category_breakdown",
            description="Per-category (and sub-category) totals, counts and deltas for one month.",
            input_schema={
                "type": "object",
                "properties": {
                    "month": month_schema,
                    "category_id": {"type": "string"},
                },
                "required": ["month"],
            },
            status_text="Breaking down spending by category…",
        ),
        ToolSpec(
            name="compare_periods",
            description="Per-category totals and differences between two date ranges.",
            input_schema={
                "type": "object",
                "properties": {
                    "a_from": {"type": "string", "format": "date"},
                    "a_to": {"type": "string", "format": "date"},
                    "b_from": {"type": "string", "format": "date"},
                    "b_to": {"type": "string", "format": "date"},
                },
                "required": ["a_from", "a_to", "b_from", "b_to"],
            },
            status_text="Comparing the two periods…",
        ),
        ToolSpec(
            name="list_expenses",
            description="Individual expenses (date, amount, category, sub-category; never notes).",
            input_schema={
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "format": "date"},
                    "date_to": {"type": "string", "format": "date"},
                    "category_id": {"type": "string"},
                    "min_amount_cents": {"type": "integer"},
                    "limit": {"type": "integer", "maximum": LIST_EXPENSES_MAX_LIMIT},
                },
                "required": ["date_from", "date_to"],
            },
            status_text="Looking up individual expenses…",
        ),
        ToolSpec(
            name="get_budgets",
            description="Overall and category budget caps with current-month progress and status.",
            input_schema={"type": "object", "properties": {}},
            status_text="Checking your budgets…",
        ),
        ToolSpec(
            name="get_insights",
            description=(
                "The ranked detector findings (facts) for one month, same as the Insights page."
            ),
            input_schema={
                "type": "object",
                "properties": {"month": month_schema},
                "required": ["month"],
            },
            status_text="Reviewing insights for that month…",
        ),
        ToolSpec(
            name="propose_budget_plan",
            description=(
                "Propose a budget plan for the user to review and Apply. Writes nothing. "
                "If allocates_overall is true, rows plus unchanged existing category budgets "
                "must add up exactly to overall_cents."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "overall_cents": {"type": "integer"},
                    "allocates_overall": {"type": "boolean"},
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "category_id": {"type": "string"},
                                "amount_cents": {"type": "integer"},
                                "reason": {"type": "string"},
                            },
                            "required": ["category_id", "amount_cents"],
                        },
                    },
                },
                "required": ["title", "rows", "allocates_overall"],
            },
            status_text="Drafting a budget plan…",
        ),
    ]


def build_handlers(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "get_month_summary": _make_get_month_summary(db, user_id),
        "get_category_breakdown": _make_get_category_breakdown(db, user_id),
        "compare_periods": _make_compare_periods(db, user_id),
        "list_expenses": _make_list_expenses(db, user_id),
        "get_budgets": _make_get_budgets(db, user_id),
        "get_insights": _make_get_insights(db, user_id),
        "propose_budget_plan": _make_propose_budget_plan(db, user_id),
    }


# ---------------------------------------------------------------------------
# Grounding check (spec §6.1): log, never block
# ---------------------------------------------------------------------------


def _pairwise_derived_tokens(values: set) -> set:
    derived = set()
    values_list = list(values)
    for i, a in enumerate(values_list):
        for b in values_list[i + 1 :]:
            derived.add(a + b)
            derived.add(abs(a - b))
    return derived


def _money_values(result: Any) -> set:
    return {
        kind_value[1]
        for kind_value in extract_number_tokens(_result_text(result))
        if kind_value[0] == "money"
    }


def check_grounding(answer_text: str, tool_results: list[ToolResultEvent]) -> None:
    """Flags (logs, does not block) money amounts in the answer that cannot be traced to this
    turn's tool results, or to a pairwise sum/difference of amounts within one result. Pairwise
    combinations are scoped per result: a coincidental match between amounts from two different
    tool calls is not treated as grounded."""
    allowed_money: set = set()
    for event in tool_results:
        result_values = _money_values(event.result)
        allowed_money |= result_values
        allowed_money |= _pairwise_derived_tokens(result_values)

    found = {value for kind, value in extract_number_tokens(answer_text) if kind == "money"}
    mismatches = found - allowed_money
    if mismatches:
        logger.warning("Chat grounding check flagged unexplained amount(s): %s", sorted(mismatches))


def _result_text(result: Any) -> str:
    return result if isinstance(result, str) else json.dumps(result)


# ---------------------------------------------------------------------------
# Public entry point: builds the system prompt + conversation and runs the loop
# ---------------------------------------------------------------------------


def _to_anthropic_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    return [{"role": m.role, "content": [{"type": "text", "text": m.content}]} for m in messages]


def run_chat_turn(
    db: Session, user_id: uuid.UUID, llm: LLMClient, request: ChatRequest
) -> Iterator[AgentEvent]:
    system = render_chat_system(
        today=today_sgt().isoformat(),
        currency=CURRENCY,
        path=request.context.path,
        month=request.context.month,
    )
    conversation = _to_anthropic_messages(request.messages)
    tools = build_tool_specs()
    handlers = build_handlers(db, user_id)

    answer_chunks: list[str] = []
    tool_results: list[ToolResultEvent] = []
    for event in run_tool_loop(llm, system, conversation, tools, handlers, MAX_OUTPUT_TOKENS):
        if isinstance(event, TextEvent):
            answer_chunks.append(event.text)
        elif isinstance(event, ToolResultEvent):
            tool_results.append(event)
        elif isinstance(event, DoneEvent):
            check_grounding("".join(answer_chunks), tool_results)
        yield event
