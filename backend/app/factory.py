from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401
from app.budgets.router import router as budgets_router
from app.categories.router import router as categories_router
from app.chat.router import router as chat_router
from app.exceptions import register_exception_handlers
from app.expenses.router import router as expenses_router
from app.insights.router import router as insights_router
from app.shared.schemas import Envelope, ok
from config.app import AppSettings, get_app_settings
from config.llm import get_llm_settings
from core.llm.factory import get_llm_client

API_PREFIX = "/api/v1"


def create_app(settings: AppSettings | None = None) -> FastAPI:
    settings = settings or get_app_settings()

    # Fail fast (spec §9): an anthropic/gemini provider missing its API key must not start.
    get_llm_settings()
    get_llm_client()

    app = FastAPI(
        title="Expense Tracker API",
        openapi_url=None if settings.is_production else "/openapi.json",
        docs_url=None if settings.is_production else "/docs",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.get(f"{API_PREFIX}/health")
    def health() -> Envelope[dict[str, str]]:
        return ok({"status": "ok"})

    app.include_router(expenses_router, prefix=API_PREFIX)
    app.include_router(categories_router, prefix=API_PREFIX)
    app.include_router(budgets_router, prefix=API_PREFIX)
    app.include_router(insights_router, prefix=API_PREFIX)
    app.include_router(chat_router, prefix=API_PREFIX)

    return app
