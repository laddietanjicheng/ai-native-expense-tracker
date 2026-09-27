FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /code
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/code/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
