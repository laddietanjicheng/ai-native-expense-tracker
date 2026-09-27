from typing import Annotated

from fastapi import APIRouter, Query

from app.dependencies import LLM, CurrentUserId, DbSession
from app.insights import service
from app.insights.schemas import InsightsOut, MonthQuery
from app.shared.schemas import Envelope, ok
from config.llm import get_llm_settings

router = APIRouter(prefix="/insights", tags=["insights"])

RESPONSES = {
    422: {"description": "Invalid month or not enough data"},
    429: {"description": "Daily generation limit reached"},
    503: {"description": "AI summary unavailable"},
}


@router.get("", response_model=Envelope[InsightsOut], responses=RESPONSES)
def get_insights(params: Annotated[MonthQuery, Query()], db: DbSession, user_id: CurrentUserId):
    return ok(service.get_insights(db, user_id, params.as_date))


@router.post("/narration", response_model=Envelope[InsightsOut], responses=RESPONSES)
def generate_narration(
    params: Annotated[MonthQuery, Query()], db: DbSession, user_id: CurrentUserId, llm: LLM
):
    settings = get_llm_settings()
    return ok(
        service.generate_narration(
            db,
            user_id,
            params.as_date,
            llm,
            settings.insights_daily_limit,
            settings.insights_model_for_provider(),
        )
    )
