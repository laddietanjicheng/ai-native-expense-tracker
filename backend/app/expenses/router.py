from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUserId, DbSession, ValidExpense
from app.expenses import service
from app.expenses.schemas import ExpenseCreate, ExpenseListParams, ExpenseOut, ExpenseUpdate
from app.shared.schemas import Envelope, ok

router = APIRouter(prefix="/expenses", tags=["expenses"])

RESPONSES = {
    404: {"description": "Expense or category not found"},
    422: {"description": "Validation error or invalid sub-category"},
}


@router.get("", response_model=Envelope[list[ExpenseOut]], responses=RESPONSES)
def list_expenses(
    params: Annotated[ExpenseListParams, Query()], db: DbSession, user_id: CurrentUserId
):
    items, meta = service.list_expenses(db, user_id, params)
    return ok(items, meta)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Envelope[ExpenseOut],
    responses=RESPONSES,
)
def create_expense(payload: ExpenseCreate, db: DbSession, user_id: CurrentUserId):
    return ok(ExpenseOut.model_validate(service.create_expense(db, user_id, payload)))


@router.get("/{expense_id}", response_model=Envelope[ExpenseOut], responses=RESPONSES)
def get_expense(expense: ValidExpense):
    return ok(ExpenseOut.model_validate(expense))


@router.patch("/{expense_id}", response_model=Envelope[ExpenseOut], responses=RESPONSES)
def update_expense(
    payload: ExpenseUpdate, expense: ValidExpense, db: DbSession, user_id: CurrentUserId
):
    return ok(ExpenseOut.model_validate(service.update_expense(db, user_id, expense, payload)))


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT, responses=RESPONSES)
def delete_expense(expense: ValidExpense, db: DbSession):
    service.delete_expense(db, expense)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
