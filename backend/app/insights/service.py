import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.budgets.models import Budget
from app.categories.models import Category
from app.exceptions import AiUnavailable, NotEnoughData, RateLimited
from app.expenses.models import Expense
from app.insights.models import InsightGeneration, InsightReport
from app.insights.schemas import (
    BudgetProgress,
    Card,
    CategoryChange,
    InsightsOut,
    Narration,
    Proposal,
    ProposalRow,
    SubCategoryChange,
    SummaryOut,
)
from app.shared.dates import SGT, add_months, month_end, month_start, today_sgt
from core.analytics.constants import HISTORY_MONTHS
from core.analytics.facts import build_facts_pack, facts_hash, public_fact
from core.analytics.models import (
    BudgetInfo,
    Candidate,
    CategoryInfo,
    ExpenseRow,
    Ledger,
    ValidatedCard,
    budget_status,
    total_cents,
)
from core.analytics.models import Proposal as CoreProposal
from core.analytics.pipeline import run_detectors
from core.analytics.ranking import rank_candidates
from core.analytics.validation import NARRATION_SCHEMA, validate_narration
from core.llm.base import LLMClient
from core.prompts.insights import INSIGHTS_SYSTEM_PROMPT, render_insights_prompt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Loading DB rows into the plain core.analytics dataclasses
# ---------------------------------------------------------------------------


def _fetch_expenses(db: Session, user_id: uuid.UUID, start, end) -> list[ExpenseRow]:
    stmt = (
        select(Expense)
        .where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None),
            Expense.expense_date >= start,
            Expense.expense_date <= end,
        )
        .order_by(Expense.expense_date, Expense.id)
    )
    return [
        ExpenseRow(
            id=e.id,
            category_id=e.category_id,
            sub_category_id=e.sub_category_id,
            amount_cents=e.amount_cents,
            expense_date=e.expense_date,
            note=e.note,
            created_at=e.created_at,
        )
        for e in db.execute(stmt).scalars()
    ]


def _fetch_categories(db: Session, user_id: uuid.UUID) -> list[CategoryInfo]:
    stmt = (
        select(Category)
        .where(Category.user_id == user_id, Category.deleted_at.is_(None))
        .order_by(Category.id)
    )
    return [
        CategoryInfo(id=c.id, parent_id=c.parent_id, name=c.name)
        for c in db.execute(stmt).scalars()
    ]


def _fetch_budgets(db: Session, user_id: uuid.UUID) -> list[BudgetInfo]:
    stmt = (
        select(Budget)
        .where(Budget.user_id == user_id, Budget.deleted_at.is_(None))
        .order_by(Budget.id)
    )
    return [
        BudgetInfo(category_id=b.category_id, amount_cents=b.amount_cents)
        for b in db.execute(stmt).scalars()
    ]


def load_ledger(db: Session, user_id: uuid.UUID, month) -> Ledger:
    start = add_months(month_start(month), -(HISTORY_MONTHS - 1))
    end = month_end(month)
    return Ledger(
        month=month,
        today=today_sgt(),
        rows=_fetch_expenses(db, user_id, start, end),
        categories=_fetch_categories(db, user_id),
        budgets=_fetch_budgets(db, user_id),
    )


# ---------------------------------------------------------------------------
# Summary + "what changed" + budget progress (deterministic, always shown)
# ---------------------------------------------------------------------------


def build_summary(ledger: Ledger) -> SummaryOut:
    current = ledger.month_rows(0)
    previous = ledger.month_rows(-1)
    total = total_cents(current)
    prev_total = total_cents(previous)
    avg3 = round(sum(total_cents(ledger.month_rows(-i)) for i in (1, 2, 3)) / 3)

    delta_prev = total - prev_total
    delta_prev_pct = round(delta_prev / prev_total * 100, 1) if prev_total else None
    delta_avg3 = total - avg3
    delta_avg3_pct = round(delta_avg3 / avg3 * 100, 1) if avg3 else None

    projected = None
    if ledger.is_current_month and ledger.days_elapsed > 0:
        projected = round(total / ledger.days_elapsed * ledger.days_in_month)

    return SummaryOut(
        total_cents=total,
        prev_total_cents=prev_total,
        delta_vs_prev_cents=delta_prev,
        delta_vs_prev_pct=delta_prev_pct,
        avg3_cents=avg3,
        delta_vs_avg3_cents=delta_avg3,
        delta_vs_avg3_pct=delta_avg3_pct,
        projected_cents=projected,
        days_elapsed=ledger.days_elapsed,
        days_in_month=ledger.days_in_month,
    )


def build_changes(ledger: Ledger) -> list[CategoryChange]:
    current = ledger.month_rows(0)
    previous = ledger.month_rows(-1)
    changes = []
    for top in ledger.top_by_id.values():
        now_cents = sum(r.amount_cents for r in current if r.category_id == top.id)
        prev_cents = sum(r.amount_cents for r in previous if r.category_id == top.id)
        subs = []
        for sub in ledger.subs_of.get(top.id, []):
            sub_now = sum(r.amount_cents for r in current if r.sub_category_id == sub.id)
            sub_prev = sum(r.amount_cents for r in previous if r.sub_category_id == sub.id)
            if sub_now or sub_prev:
                subs.append(
                    SubCategoryChange(
                        category_id=sub.id,
                        name=sub.name,
                        now_cents=sub_now,
                        prev_cents=sub_prev,
                        delta_cents=sub_now - sub_prev,
                    )
                )
        if now_cents or prev_cents:
            changes.append(
                CategoryChange(
                    category_id=top.id,
                    name=top.name,
                    now_cents=now_cents,
                    prev_cents=prev_cents,
                    delta_cents=now_cents - prev_cents,
                    sub_categories=subs,
                )
            )
    changes.sort(key=lambda c: abs(c.delta_cents), reverse=True)
    return changes


def build_budget_progress(ledger: Ledger) -> list[BudgetProgress]:
    current = ledger.month_rows(0)
    rows = []
    for budget in ledger.budgets:
        spent = (
            total_cents(current)
            if budget.category_id is None
            else sum(r.amount_cents for r in current if r.category_id == budget.category_id)
        )
        projected = None
        if ledger.is_current_month and ledger.days_elapsed > 0:
            projected = round(spent / ledger.days_elapsed * ledger.days_in_month)
        name = (
            "Overall"
            if budget.category_id is None
            else ledger.top_by_id.get(
                budget.category_id,
                CategoryInfo(id=budget.category_id, parent_id=None, name="Unknown"),
            ).name
        )
        rows.append(
            BudgetProgress(
                category_id=budget.category_id,
                name=name,
                cap_cents=budget.amount_cents,
                spent_cents=spent,
                pct=round(spent / budget.amount_cents * 100, 1),
                projected_cents=projected,
                status=budget_status(
                    spent, budget.amount_cents, projected, ledger.is_current_month
                ),
            )
        )
    rows.sort(key=lambda r: (r.category_id is not None, r.name))
    return rows


# ---------------------------------------------------------------------------
# Converting core (plain) dataclasses to the app's pydantic response schemas
# ---------------------------------------------------------------------------


def _to_app_proposal(proposal: CoreProposal | None) -> Proposal | None:
    if proposal is None:
        return None
    return Proposal(
        title=proposal.title,
        footer=proposal.footer,
        rows=[
            ProposalRow(
                category_id=row.category_id,
                name=row.name,
                from_cents=row.from_cents,
                to_cents=row.to_cents,
                reason=row.reason,
            )
            for row in proposal.rows
        ],
    )


def _card_to_dict(card: ValidatedCard) -> dict:
    return {
        "type": card.type,
        "title": card.title,
        "body": card.body,
        "fact_ids": card.fact_ids,
        "proposal": _to_app_proposal(card.proposal).model_dump(mode="json")
        if card.proposal
        else None,
    }


# ---------------------------------------------------------------------------
# Narration: facts -> LLM -> validate -> one retry -> AI_UNAVAILABLE
# ---------------------------------------------------------------------------


def _call_llm(llm: LLMClient, system: str, prompt: str, schema: dict) -> dict:
    """Any provider failure (transport error, rate limit, malformed response) becomes
    AI_UNAVAILABLE; only the exception type is logged, never the prompt or any key."""
    try:
        return llm.generate_structured(system, prompt, schema, "write_insight_cards")
    except Exception as exc:
        logger.exception("Insights narration LLM call failed (%s)", type(exc).__name__)
        raise AiUnavailable() from exc


def _generate_narration(
    llm: LLMClient, facts: list[dict], candidates_by_id: dict[str, Candidate]
) -> list[ValidatedCard]:
    for fact in facts:
        candidate = candidates_by_id[fact["id"]]
        if candidate.proposal is not None:
            fact["_proposal"] = candidate.proposal

    prompt_facts = [public_fact(f) for f in facts]
    prompt = render_insights_prompt(prompt_facts)
    raw = _call_llm(llm, INSIGHTS_SYSTEM_PROMPT, prompt, NARRATION_SCHEMA)
    cards, errors = validate_narration(raw, facts)
    if cards is not None:
        return cards

    retry_prompt = render_insights_prompt(prompt_facts, errors)
    raw_retry = _call_llm(llm, INSIGHTS_SYSTEM_PROMPT, retry_prompt, NARRATION_SCHEMA)
    cards, errors = validate_narration(raw_retry, facts)
    if cards is not None:
        return cards
    raise AiUnavailable()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _has_data(ledger: Ledger) -> bool:
    return bool(ledger.month_rows(0)) and bool(ledger.month_rows(-1))


def _previous_report_cards(db: Session, user_id: uuid.UUID, month) -> list[dict]:
    prev_month = add_months(month_start(month), -1)
    stmt = select(InsightReport).where(
        InsightReport.user_id == user_id, InsightReport.month == prev_month
    )
    report = db.execute(stmt).scalar_one_or_none()
    return report.cards if report else []


def _stored_report(db: Session, user_id: uuid.UUID, month) -> InsightReport | None:
    stmt = select(InsightReport).where(
        InsightReport.user_id == user_id, InsightReport.month == month
    )
    return db.execute(stmt).scalar_one_or_none()


def ranked_facts(
    db: Session, user_id: uuid.UUID, ledger: Ledger
) -> tuple[list[Candidate], list[dict]]:
    candidates = run_detectors(ledger)
    previous_cards = _previous_report_cards(db, user_id, ledger.month)
    ranked = rank_candidates(candidates, ledger.is_current_month, previous_cards)
    return ranked, build_facts_pack(ranked)


def _public_cards(stored_cards: list[dict]) -> list[dict]:
    return [
        {
            "type": c["type"],
            "title": c["title"],
            "body": c["body"],
            "fact_ids": c["fact_ids"],
            "proposal": c.get("proposal"),
        }
        for c in stored_cards
    ]


def get_insights(db: Session, user_id: uuid.UUID, month) -> InsightsOut:
    ledger = load_ledger(db, user_id, month)
    summary = build_summary(ledger)
    changes = build_changes(ledger)
    budgets = build_budget_progress(ledger)

    report = _stored_report(db, user_id, month)
    narration = None
    is_stale = False
    if report is not None:
        _, facts = ranked_facts(db, user_id, ledger)
        is_stale = facts_hash(facts) != report.facts_hash
        narration = Narration(
            cards=[Card(**c) for c in _public_cards(report.cards)],
            model=report.model,
            created_at=report.created_at,
        )

    return InsightsOut(
        month=month,
        summary=summary,
        changes=changes,
        budgets=budgets,
        narration=narration,
        is_stale=is_stale,
    )


def _sgt_midnight_today() -> datetime:
    today = today_sgt()
    return datetime(today.year, today.month, today.day, tzinfo=SGT)


def _check_rate_limit(db: Session, user_id: uuid.UUID, daily_limit: int) -> None:
    day_start = _sgt_midnight_today()
    stmt = select(InsightGeneration).where(
        InsightGeneration.user_id == user_id, InsightGeneration.created_at >= day_start
    )
    count = len(db.execute(stmt).scalars().all())
    if count >= daily_limit:
        raise RateLimited()


def generate_narration(
    db: Session, user_id: uuid.UUID, month, llm: LLMClient, daily_limit: int, model_name: str
) -> InsightsOut:
    ledger = load_ledger(db, user_id, month)
    if not _has_data(ledger):
        raise NotEnoughData()

    _check_rate_limit(db, user_id, daily_limit)

    ranked, facts = ranked_facts(db, user_id, ledger)
    candidates_by_id = {f["id"]: ranked[i] for i, f in enumerate(facts)}

    try:
        cards = _generate_narration(llm, facts, candidates_by_id)
    except AiUnavailable:
        db.add(InsightGeneration(user_id=user_id))
        db.commit()
        raise

    computed_hash = facts_hash(facts)
    stored_cards = []
    for c in cards:
        card_dict = _card_to_dict(c)
        primary = candidates_by_id[c.fact_ids[0]]
        card_dict["_novelty_key"] = primary.novelty_key
        card_dict["_impact_cents"] = primary.impact_cents
        stored_cards.append(card_dict)

    report = _stored_report(db, user_id, month)
    if report is None:
        report = InsightReport(
            user_id=user_id,
            month=month,
            facts_hash=computed_hash,
            cards=stored_cards,
            model=model_name,
        )
        db.add(report)
    else:
        report.facts_hash = computed_hash
        report.cards = stored_cards
        report.model = model_name
        report.created_at = datetime.now(UTC)
    db.add(InsightGeneration(user_id=user_id))
    db.commit()

    return get_insights(db, user_id, month)
