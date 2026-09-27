# Backend Architecture

## Layout

```
backend/
  app/                 # product features (what the user sees through the API)
    main.py            # app = create_app()
    factory.py         # create_app(settings): FastAPI app, middleware, error handlers, routers
    dependencies.py    # all dependency injection: DB session, current user, valid_<entity>_id loaders, LLM
    exceptions.py      # AppError hierarchy (every API error code) + handlers
    models.py          # registers every ORM model (used by the app and Alembic)
    seed.py            # default user + categories
    shared/            # response envelope, CustomModel, pagination, SGT date helpers
    users/             # models.py (login later)
    categories/        # models.py, schemas.py, service.py, router.py
    expenses/          # models.py, schemas.py, service.py, router.py
    budgets/           # models.py, schemas.py, service.py, router.py (overall + per-category caps)
    insights/          # models.py, schemas.py, service.py (DB, caching, rate limit, LLM call), router.py
    chat/               # schemas.py, service.py (tool specs/handlers, SSE turn runner), router.py,
                        # models.py (ChatTurn: only stores a daily rate-limit counter, never history)
  core/                # infrastructure the features call
    database.py        # engine, session, Base with naming conventions
    models.py          # timestamp / soft-delete mixins
    dates.py           # SGT-aware date helpers (pure; app/shared/dates.py re-exports them)
    llm/               # LLMClient Protocol (generate_structured + stream_turn) + anthropic/fake
                        # implementations + factory
    agents/            # tool_loop.py: generic provider-agnostic tool-use loop for the chat SSE
                        # turn (status/text/tool_result/proposal/done/error events); no app imports
    prompts/           # insights + chat system prompts (and facts-pack rendering)
    analytics/         # pure insights engine: dataclasses, D1-D10 detectors, ranking, facts
                        # pack, narration validator -- no DB, no app imports (see below)
  config/              # settings for core and app, one module per concern
    base.py            # shared BaseSettings (.env loading)
    app.py             # environment, CORS
    database.py        # database URLs
    llm.py             # LLMSettings: provider, model, api key, timeouts, daily limits
```

Every feature folder has exactly four files: `models.py` (tables), `schemas.py` (request/response
shapes and their limits), `service.py` (queries + business rules), `router.py` (thin HTTP layer).
Routers get their inputs from `app/dependencies.py` via `Annotated` aliases
(`DbSession`, `CurrentUserId`, `ValidCategory`, `ValidExpense`), so swapping an implementation
(or a test fake via `dependency_overrides`) happens in one place.

## Dependency rule

`app -> core -> config`. Imports only point to the right:

- `app` may import `core` and `config`.
- `core` may import `config`, never `app`.
- `config` imports nothing from the project.

`tests/test_architecture.py` fails the build if `core` or `config` import a higher layer.

## Adding core capabilities (LLM, agents, vector DB, prompts, tools, object store)

Each capability is a package in `core/` with its settings in `config/`, and a factory that
picks the implementation from configuration:

```
config/vector_store.py      # VectorStoreSettings: PROVIDER = "pgvector" | "qdrant" | ...
core/vector_store/
  base.py                   # VectorStore Protocol: the only type app code depends on
  pgvector.py               # PgVectorStore(VectorStore)
  qdrant.py                 # QdrantVectorStore(VectorStore)
  factory.py                # get_vector_store() -> VectorStore
```

```python
# core/vector_store/factory.py
_PROVIDERS: dict[VectorProvider, Callable[[VectorStoreSettings], VectorStore]] = {
    VectorProvider.PGVECTOR: PgVectorStore,
    VectorProvider.QDRANT: QdrantVectorStore,
}


@lru_cache
def get_vector_store() -> VectorStore:
    settings = get_vector_store_settings()
    return _PROVIDERS[settings.provider](settings)
```

The same shape applies to `core/llm/`, `core/agents/`, `core/prompts/`, `core/tools/` and
`core/object_store/`. Rules:

- App features receive providers through FastAPI dependencies (`Depends(get_vector_store)`),
  never by importing a concrete class, so tests swap in fakes via `dependency_overrides`.
- Provider SDK imports stay inside the concrete implementation file.
- Adding a provider = one new file + one registry entry; no feature code changes.
- Build a capability package only when a feature needs it.

## A pure business-logic capability: `core/analytics/`

Not every `core/` package is a swappable provider behind a Protocol; some hold business logic
that is pure enough (no DB session, no wall clock) to live outside `app/` for testability and
file size. `core/analytics/` is the insights engine used by `app/insights/service.py`:

```
core/analytics/
  constants.py      # every detector threshold and ranking weight, one place
  models.py         # plain dataclasses: ExpenseRow, CategoryInfo, BudgetInfo, Ledger, Candidate,
                     # Proposal, ValidatedCard -- never the app's SQLAlchemy models or Pydantic schemas
  formatting.py      # fmt_money/fmt_pct and the inverse: extracting numeric claims from text
  detectors.py        # D1-D5
  detectors_extra.py  # D6-D10 (split from detectors.py to keep files small)
  ranking.py          # kind-weight, novelty, top-5 selection (deterministic tie-break)
  facts.py            # candidates -> numbered facts pack + canonical facts_hash
  validation.py       # narration schema + "every number must come from a cited fact"
  pipeline.py         # run_detectors(): the DETECTORS registry
```

`app/insights/service.py` only: loads DB rows into the `core.analytics.models` dataclasses
(with an explicit `ORDER BY` and an injected SGT "today", so runs are deterministic and
testable), builds the summary/"what changed"/budget-progress numbers, calls the LLM, caches
and rate-limits, and converts the pure `Proposal`/`ValidatedCard` dataclasses to the app's
Pydantic response schemas. Nothing in `core/analytics/` reads the database or the wall clock.
