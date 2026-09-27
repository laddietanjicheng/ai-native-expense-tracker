from fastapi import APIRouter

from app.budgets import service
from app.budgets.schemas import BudgetPatch, BudgetPut, BudgetsOut, BudgetsPatchOut
from app.dependencies import CurrentUserId, DbSession
from app.shared.schemas import Envelope, ok

router = APIRouter(prefix="/budgets", tags=["budgets"])

RESPONSES = {422: {"description": "Invalid budget plan"}}


@router.get("", response_model=Envelope[BudgetsOut])
def get_budgets(db: DbSession, user_id: CurrentUserId):
    return ok(service.get_budgets(db, user_id))


@router.put("", response_model=Envelope[BudgetsOut], responses=RESPONSES)
def replace_budgets(payload: BudgetPut, db: DbSession, user_id: CurrentUserId):
    return ok(service.replace_budgets(db, user_id, payload))


@router.patch("", response_model=Envelope[BudgetsPatchOut], responses=RESPONSES)
def patch_budgets(payload: BudgetPatch, db: DbSession, user_id: CurrentUserId):
    return ok(service.patch_budgets(db, user_id, payload))
