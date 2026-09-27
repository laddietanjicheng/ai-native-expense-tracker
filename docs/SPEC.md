# Expense Tracker — v1 Specification

## 1. Scope

A personal expense tracker. Users record expenses, organise them into categories and
sub-categories, and filter/sort the list.

**Stack:** Next.js (frontend) · FastAPI (backend) · PostgreSQL

**Out of scope for v1:** login/auth (planned next), multi-currency, budgets, recurring
expenses, receipts, charts/dashboards, CSV import/export, split expenses, tags,
restoring deleted expenses.

## 2. Decisions

| Topic | Decision |
|---|---|
| Currency | SGD only. Amounts stored as integer cents. |
| Users | No login yet. Every table carries `user_id`; a single default user is seeded. |
| Category depth | Exactly two levels: Category → Sub-category. |
| Sub-categories per expense | Zero or one. |
| Limits | 100 top-level categories per user, 50 sub-categories per category. |
| Expense delete | Soft delete (`deleted_at`). Deleted expenses are hidden everywhere. |
| Category delete | Blocked (409) if the category or any of its sub-categories has **active** expenses. Otherwise the category **and its sub-categories** are soft-deleted. |
| Default categories | Seeded for each new user (see §6). |
| Filters | Horizontal filter bar of compact dropdowns (date, category, sub-category, sort) with an applied-filters row. Date presets: Last 7 days, This month, Last month, Last 3 months, This year, All time, Custom range. |
| Sorting | By date or amount, ascending/descending. Default: date desc. |

## 3. User Stories & Acceptance Criteria

### US1 — Add / edit / delete expenses
- Required: amount (> 0, max 2 decimal places, ≤ 1,000,000.00), date, category.
- Optional: sub-category (must belong to the chosen category), note (≤ 500 chars).
- Date defaults to today (Asia/Singapore).
- Edit uses the same validation. Changing the category clears an incompatible sub-category.
- Delete asks for confirmation, then soft-deletes.

### US2 — Filter expenses
- Date presets: Last 7 days, This month, Last month, Last 3 months, This year, All time (no date bounds), Custom range (inclusive, start <= end enforced in the picker).
- Category filter (multi-select). Selecting a category includes all its sub-categories.
- Sub-category filter (only shown once a single category is selected).
- Filters combine with AND. The list shows the count and total amount of the filtered set.
- Empty result shows an explicit empty state.

### US3 — Add categories
- Name 1–50 chars, trimmed, unique per user (case-insensitive) among active categories.

### US4 — Add sub-categories
- Belongs to exactly one top-level category.
- Name unique within its parent (case-insensitive) among active sub-categories.
- A sub-category cannot have children.

### US5 — Rename / delete categories
- Rename follows the same naming rules as create.
- Delete is blocked when active expenses exist; the error reports how many.
- Deleting a category also deletes its sub-categories (subject to the rule above).

### US6 — Sort the list
- Sort by date or amount, asc/desc. Ties broken by `created_at desc`.

## 4. Database Schema

```sql
CREATE TABLE app_user (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE,              -- nullable until auth exists
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id),
    parent_id   UUID REFERENCES category(id),   -- NULL = top-level
    name        VARCHAR(50) NOT NULL CHECK (length(trim(name)) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (id, parent_id)                        -- target for composite FK below
);

-- Unique names among active rows only (a deleted name can be reused)
CREATE UNIQUE INDEX uq_category_top_name
    ON category (user_id, lower(name))
    WHERE parent_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_category_sub_name
    ON category (parent_id, lower(name))
    WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE expense (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app_user(id),
    category_id     UUID NOT NULL REFERENCES category(id),
    sub_category_id UUID,
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    expense_date    DATE NOT NULL,
    note            VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    -- Guarantees the sub-category's parent IS the expense's category
    FOREIGN KEY (sub_category_id, category_id) REFERENCES category (id, parent_id)
);

CREATE INDEX ix_expenses_user_date
    ON expense (user_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_expenses_user_category
    ON expense (user_id, category_id) WHERE deleted_at IS NULL;
```

Enforced in the application layer (not expressible as simple constraints):
- A category's parent must itself be top-level (max depth 2).
- Per-user / per-parent count limits (100 / 50).
- Category and its expenses must belong to the same user.

## 5. REST API (`/api/v1`)

All responses use one envelope:

```json
{ "success": true, "data": { }, "error": null, "meta": null }
{ "success": false, "data": null, "error": { "code": "CATEGORY_IN_USE", "message": "...", "details": { } }, "meta": null }
```

### Expenses

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/expenses` | List with filters, sort, pagination | 200 |
| POST | `/expenses` | Create | 201 |
| GET | `/expenses/{id}` | Get one | 200 |
| PATCH | `/expenses/{id}` | Partial update | 200 |
| DELETE | `/expenses/{id}` | Soft delete | 204 |

`GET /expenses` query params:

| Param | Type | Default | Notes |
|---|---|---|---|
| `date_from` | date | — | inclusive |
| `date_to` | date | — | inclusive; must be ≥ `date_from` |
| `category_id` | uuid, repeatable | — | top-level categories |
| `sub_category_id` | uuid | — | |
| `sort` | `date` \| `amount` | `date` | |
| `order` | `asc` \| `desc` | `desc` | |
| `page` | int ≥ 1 | 1 | |
| `page_size` | int 1–100 | 20 | |

Date presets are resolved to `date_from`/`date_to` by the frontend (Asia/Singapore); "All time" sends neither.

`meta` for the list: `{ "page", "page_size", "total_count", "total_amount_cents", "category_count" }`
(totals cover the whole filtered set, not just the current page; `category_count` is the
number of distinct top-level categories in that set).

Expense shape:

```json
{
  "id": "uuid",
  "amount_cents": 1250,
  "expense_date": "2026-09-26",
  "note": "Lunch",
  "category":     { "id": "uuid", "name": "Food" },
  "sub_category": { "id": "uuid", "name": "Dining Out" },
  "created_at": "...",
  "updated_at": "..."
}
```

Create/update body: `{ amount_cents, expense_date, category_id, sub_category_id?, note? }`.

### Categories

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/categories` | Full tree (top-level with nested `sub_categories`), sorted by name. Optional `date_from` / `date_to` scope each `expense_count` to that range (default: all time) | 200 |
| POST | `/categories` | Create; body `{ name, parent_id? }` | 201 |
| PATCH | `/categories/{id}` | Rename; body `{ name }` | 200 |
| DELETE | `/categories/{id}` | Soft delete (+ sub-categories) | 204 |

Category shape (`sub_categories` is `[]` on sub-categories; `expense_count` counts active
expenses, and a top-level category's count includes its sub-categories):

```json
{
  "id": "uuid",
  "name": "Food",
  "parent_id": null,
  "expense_count": 42,
  "sub_categories": [
    { "id": "uuid", "name": "Groceries", "parent_id": "uuid", "expense_count": 16, "sub_categories": [] }
  ]
}
```

### Error codes

| HTTP | Code | When |
|---|---|---|
| 404 | `NOT_FOUND` | Missing or soft-deleted resource |
| 409 | `CATEGORY_IN_USE` | Delete blocked; `details.active_expense_count` |
| 409 | `DUPLICATE_NAME` | Category name already exists at that level |
| 422 | `VALIDATION_ERROR` | Bad input; `details` lists field errors |
| 422 | `INVALID_SUB_CATEGORY` | Sub-category does not belong to category |
| 422 | `MAX_DEPTH_EXCEEDED` | Parent is itself a sub-category |
| 422 | `LIMIT_REACHED` | Category / sub-category cap hit |

## 6. Seed Data

| Category | Sub-categories |
|---|---|
| Food | Groceries, Dining Out, Coffee & Snacks |
| Transport | Public Transport, Taxi & Ride-hailing, Fuel & Parking |
| Bills & Utilities | Electricity & Water, Phone & Internet, Subscriptions |
| Shopping | Clothing, Household, Electronics |
| Health | Medical, Pharmacy, Fitness |
| Entertainment | Movies & Events, Hobbies, Travel |
| Other | — |

## 7. Screens

1. **Expenses** (`/`) — filter bar (date preset, category, sub-category), sort control,
   summary strip (count + total SGD), paginated table, "Add expense" button.
   Row actions: edit, delete (confirm dialog).
2. **Add / Edit expense** — modal form; sub-category dropdown filtered by category.
3. **Categories** (`/categories`) — tree view; add category, add sub-category,
   rename inline, delete (shows blocking-expense count on failure).

## 8. Non-functional

- Server-side validation on every endpoint (Pydantic); client-side validation for UX only.
- Money never uses floats — cents in DB/API, formatted as SGD only in the UI.
- All queries filter by `user_id` and `deleted_at IS NULL`.
- Schema managed with Alembic migrations.
- Tests: unit + API integration (pytest against a real Postgres), E2E for the main flows (Playwright). Target ≥ 80% coverage.
