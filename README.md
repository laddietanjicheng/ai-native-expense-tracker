# Expense Tracker

Next.js frontend, FastAPI backend, PostgreSQL. See `docs/SPEC.md` and `docs/ARCHITECTURE.md`.

## Run with Docker (hot reload)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1 (docs at http://localhost:8000/docs)
- Postgres: localhost:5432 (`expense` / `expense`)

`docker-compose.override.yml` is applied automatically: it mounts `backend/` and `frontend/` into
the containers and runs `uvicorn --reload` and `next dev`, so code changes show up without a
rebuild. Rebuild only after changing dependencies (`pyproject.toml`, `package.json`).

The backend's `.venv` lives in an anonymous volume, so a plain rebuild can keep stale
dependencies; after changing `pyproject.toml` run
`docker compose up -d --build --renew-anon-volumes backend` to force it to reinstall.

Load demo categories and ~6 months of expenses (safe to re-run):

```bash
docker compose exec backend python -m app.seed_demo
```

Production-style images (no mounts, `next start`):

```bash
docker compose -f docker-compose.yml up --build
```

## Without Docker

```bash
docker compose up -d db

cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8000
uv run pytest --cov

cd frontend
npm install
npm run dev
npm test
```

## AI providers

The insights narration and spending chat go through a swappable LLM layer
(`backend/core/llm/`), picked by `LLM_PROVIDER` in `.env`:

- `fake` (default) — deterministic, no API key, used for local dev and tests.
- `anthropic` — requires `ANTHROPIC_API_KEY`.
- `gemini` — requires `GEMINI_API_KEY` (a free key from [Google AI Studio](https://aistudio.google.com/apikey)).
  Google's free tier may use the content you send to improve its products, so only point it at
  demo data, not real expenses.
