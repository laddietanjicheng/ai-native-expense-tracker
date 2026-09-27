from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.shared.schemas import ErrorPayload


class AppError(Exception):
    code: str = "APP_ERROR"
    message: str = "Application error"
    status_code: int = status.HTTP_400_BAD_REQUEST

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        self.message = message or self.message
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(AppError):
    code = "NOT_FOUND"
    message = "Resource not found"
    status_code = status.HTTP_404_NOT_FOUND


class CategoryNotFound(NotFoundError):
    message = "Category not found"


class ExpenseNotFound(NotFoundError):
    message = "Expense not found"


class DuplicateName(AppError):
    code = "DUPLICATE_NAME"
    message = "A category with this name already exists"
    status_code = status.HTTP_409_CONFLICT


class CategoryInUse(AppError):
    code = "CATEGORY_IN_USE"
    message = "Category has active expenses"
    status_code = status.HTTP_409_CONFLICT


class MaxDepthExceeded(AppError):
    code = "MAX_DEPTH_EXCEEDED"
    message = "Sub-categories cannot have their own children"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class LimitReached(AppError):
    code = "LIMIT_REACHED"
    message = "Category limit reached"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class InvalidSubCategory(AppError):
    code = "INVALID_SUB_CATEGORY"
    message = "Sub-category does not belong to the category"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class InvalidBudgetPlan(AppError):
    code = "INVALID_BUDGET_PLAN"
    message = "Budget plan is invalid"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class NotEnoughData(AppError):
    code = "NOT_ENOUGH_DATA"
    message = "Not enough expense data to generate insights"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class RateLimited(AppError):
    code = "RATE_LIMITED"
    message = "Daily generation limit reached"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class AiUnavailable(AppError):
    code = "AI_UNAVAILABLE"
    message = "AI summary is unavailable"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


def _envelope_error(code: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
    payload = ErrorPayload(code=code, message=message, details=details)
    return {"success": False, "data": None, "error": payload.model_dump(), "meta": None}


def _validation_details(exc: RequestValidationError) -> dict[str, Any]:
    fields: dict[str, str] = {}
    for error in exc.errors():
        field = ".".join(str(part) for part in error["loc"][1:]) or str(error["loc"][-1])
        fields[field] = error["msg"]
    return {"fields": fields}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope_error(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=_envelope_error(
                "VALIDATION_ERROR", "Request validation failed", _validation_details(exc)
            ),
        )
