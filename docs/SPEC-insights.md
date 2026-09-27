# Expense Tracker — v2 Specification: Insights & Budgets

Extends [SPEC.md](SPEC.md). Status: **draft for review**.

## 1. Scope

Make the tracker explain spending: what changed month over month, where the user stands
against their budgets, and practical tips. Numbers are computed deterministically in SQL;
Claude only turns those numbers into short written insights.

**In scope:** monthly budgets (overall + per top-level category), an Insights page,
AI-written insight cards generated on demand and cached, and a spending chat that answers
questions and proposes budget plans the user can apply.

**Out of scope for v2:** savings goals (no income tracking), sub-category budgets,
per-month budget overrides, sending expense notes to the LLM, auto-categorisation,
scheduled/month-end reports, login.
Gamification and logging shortcuts (streaks, challenges, badges, recap, quick add, reminders) are planned for a separate v3 "habits" release.

## 2. Decisions

| Topic | Decision |
|---|---|
| Budget types | One optional **overall** monthly cap + one optional cap per **top-level** category. |
| Budget period | Calendar month (Asia/Singapore). A budget applies to every month until changed or removed. |
| Insights period | One calendar month, default the current month; user can step back through past months. |
| Comparisons | Selected month vs previous month, and vs the average of the 3 months before it. |
| AI input | **Aggregates only**: category/sub-category totals, deltas, budget numbers, counts, individual amounts with category and date. **Never notes**, never IDs of the user. |
| Notes | SQL detectors **may read notes locally** to match repeat charges and duplicates; the facts pack labels them by sub-category + amount only. |
| Tone | Neutral analyst: facts and options, no praise, blame or exclamation marks. Wins are stated plainly. |
| AI output | 2–5 structured cards; every number in a card must appear in the facts it cites (validated server-side). |
| Generation | On demand: generated the first time the month's Insights are opened, then cached. **Refresh** regenerates. |
| Staleness | Each cached report stores a hash of its facts; if today's facts differ, the page says the summary is out of date. |
| Failure | If the LLM fails or output fails validation (after one retry), the page still shows all deterministic numbers with an "AI summary unavailable" notice. |
| Models | Narration: `claude-sonnet-5`. Provider and model come from config (factory in `core/llm/`), with a `fake` provider for tests and keyless local dev, and a `gemini` provider (`gemini-3.8-flash`) to test against Gemini's free API. |
| Rate limit | Max 20 generations per user per day (config). |

## 3. User Stories & Acceptance Criteria

### US7 — Set monthly budgets
- A single "Monthly budgets" dialog edits the overall cap and one cap per active top-level category.
- Amount > 0, max 2 decimal places, ≤ 1,000,000.00. Blank = no budget (removes an existing one).
- Each row shows that category's 3-month average spend as a hint.
- Budgets are not validated against each other (category caps may sum to more than the overall cap).
- Deleting a category soft-deletes its budget.

### US8 — See how this month compares
- Summary: total spent, change vs previous month (amount and %), change vs 3-month average.
- For the current month, a projected month-end total = spent ÷ days elapsed × days in month.
- "What changed" table: every top-level category with spend this month, last month and the change,
  sorted by absolute change. Expandable to sub-categories.

### US9 — Track budgets
- Each budget shows spent / cap, % used and a status:
  - **Over** — spent > cap
  - **At risk** — current month only, projected > cap
  - **On track** — otherwise
- Status is always written as text, not colour alone.

### US10 — Read AI insights
- Card types: `pace`, `change`, `leak`, `recurring`, `timing`, `trend`, `budget`, `anomaly`, `win`, `logging`, `tip`.
- At most 5 cards, chosen by the ranking in §4.3. Budget suggestions (§4.1 D7) render as a plan card with **Apply**, like chat.
- Shows when it was generated and a Refresh button; shows "out of date" when facts changed.
- Needs at least one expense in the selected month **and** in the previous month; otherwise
  the AI section explains what's missing and only the numbers are shown.

## 4. Insight detectors (deterministic, no AI)

`app/insights/service.py` computes base facts for `(user_id, month)` (totals, previous month,
3-month average, per category/sub-category counts and averages, budget progress, days elapsed),
then runs the detectors below. Each detector emits zero or more **candidates**:
`{ kind, subject, impact_cents, confidence, values }`. All thresholds live in one constants block.

### 4.1 Detectors

| ID | Kind | Fires when | Output values |
|---|---|---|---|
| D1 | `pace` | Current month and a budget exists. | remaining, days left (incl. today), daily allowance = remaining ÷ days left, projected, status |
| D2 | `change` | A sub-category (or category without subs) moved ≥ S$20 **and** ≥ 15% vs last month. | now/prev totals, counts, averages, **driver** = `frequency` if \|Δcount × avg_prev\| ≥ \|Δavg × count_now\| else `price`; delta vs 3-month average |
| D3 | `leak` | In one sub-category: ≥ 8 expenses of ≤ S$15 in the month, summing to ≥ S$50. | count, sum, average |
| D4 | `recurring` | A series (same normalised note, else same sub-category + amount) appears once in each of the last 3 months, amounts within ±10%. Flags: **new** (confirmed this month for the first time), **price change** (latest vs previous ≥ 5%). | label (sub-category + amount), monthly total of all series, old/new amount |
| D5 | `timing` | Over the last 3 months: a category has ≥ 60% of spend on weekends with ≥ 6 expenses; or ≥ 40% of total spend falls in days 1–7. | share %, amount |
| D6 | `trend` | A category rose (or fell) in each of the last 4 months, net change ≥ S$50 and ≥ 20%. Needs 4 months of data. | the 4 monthly totals, net change |
| D7 | `budget` | Over cap in each of the last 3 closed months → suggest cap = 3-month average rounded up to S$10. Under 75% in each of the last 3 → suggest lowering to the highest month rounded up to S$10, freeing the difference. | cap, months, suggested cap, freed amount |
| D8 | `anomaly` | **Duplicate:** ≥ 2 expenses with the same amount, category, date (and note, if any). **Outlier:** amount ≥ 3× the category's median over the prior 90 days, ≥ S$50, median from ≥ 5 expenses. | date, amount, multiple of median |
| D9 | `win` | A category fell 3 months in a row; a budget was kept after being over the prior month; overall under budget for N closed months in a row (N ≥ 2). | amounts, streak length |
| D10 | `logging` | A gap of ≥ 4 days with no expenses, for a user who logs on ≥ 60% of days; or "Other" ≥ 15% of the month and ≥ S$50. | gap dates, share % |

Confidence gates: no D6 below 4 months of history, no D4 below 3 occurrences, no D7 below 3 closed months with that budget.

### 4.2 Month phase

- **Running month:** weights favour D1, D8, D10, then D2/D3.
- **Closed month (review):** weights favour D2, D6, D7, D9, then D4/D5; D1 is replaced by the final budget result.

### 4.3 Ranking

`score = impact_cents × kind_weight(phase) × novelty`

- `novelty` = 0.3 if the same `kind + subject` appeared in the previous month's report with a value within ±20%, else 1.
- Duplicates (D8) always make the cut; one `win` is included if any exist.
- Keep the top 5 candidates. Only those, plus the base summary numbers, become the facts pack.

### 4.4 Facts pack

Candidates are serialised as numbered facts (`F1…Fn`), each with `kind`, plain values in cents and
pre-formatted display strings (`"S$96.40"`, `"12%"`). That pack is the only thing sent to Claude.
Claude writes one card per candidate (plus at most one `tip` derived from them) and may not add facts.

## 5. AI narration contract

- System prompt: role, tone (neutral analyst: plain, specific, no praise or blame, no financial-product advice),
  card types, "use only numbers present in the facts; cite fact ids".
- Output (tool/structured output): `{ "cards": [ { "type", "title" (≤ 60 chars), "body" (≤ 240 chars), "fact_ids": ["F3"] } ] }`.
- Validator rejects the output if: schema invalid; a `fact_id` doesn't exist; any money or
  percentage in `title`/`body` isn't one of the display strings of the cited facts; more than 5 cards.
- One retry with the validation errors appended; then fall back to "unavailable".
- A card built from a D7 candidate carries a server-built `proposal` (same shape as the chat plan card),
  so the Insights page can show **Apply**. Claude never writes the proposal's numbers.

## 6. Spending chat

### US11 — Ask about my spending
- A right-hand panel on every page: **docked** (400px), **expanded** (640px) or **minimised** to an
  "Ask about your spending" button. The mode is remembered per browser (localStorage).
- Empty state shows 4 example questions. Enter sends, Shift+Enter adds a new line.
- Answers stream in. While a tool runs, a short status shows (e.g. "Looking at September…").
- History lives only in the browser tab (React state); **New conversation** clears it. Nothing is stored server-side.
- Footer: "Uses your totals and amounts, never your notes. Cleared when you close the tab. Not financial advice."

### US12 — Plan and change budgets from chat
- The user can state a target and priorities ("only S$1,000 next month", "keep Health at 100");
  Claude replies with a **plan card**: title, rows `{ category or Overall, from, to, reason? }`, footer
  text, **Apply** / **Dismiss**. After Apply: "Budgets updated · Undo".
- The budgets dialog has **Plan with Claude**: closes the dialog, opens the chat docked and pre-fills
  "I want to spend at most S$ this month. How should I split it?" with the cursor after "S$".
- Nothing changes until Apply. Apply sends the card's changes to `PATCH /budgets`; Undo sends back the
  `previous` values that call returned.

### 6.1 How it works

- `POST /chat` with `{ messages: [{ role, content }], context: { path, month } }`. The client sends the
  whole session history each turn (max 20 messages, 2,000 chars each). The response is a
  **Server-Sent Events** stream:
  `status` (tool progress text) · `text` (answer delta) · `proposal` (a validated plan card) · `done` · `error`.
- The server runs a tool-use loop with `claude-sonnet-5`: at most 6 tool rounds and 1,500 output tokens per turn.
- **Read-only tools** (all scoped to the current user; they never return notes):

| Tool | Returns |
|---|---|
| `get_month_summary(month)` | Totals, previous month, 3-month average, projection, days elapsed |
| `get_category_breakdown(month, category_id?)` | Per category/sub-category totals, counts, averages, deltas |
| `compare_periods(a_from, a_to, b_from, b_to)` | Per-category totals for two date ranges and the differences |
| `list_expenses(date_from, date_to, category_id?, min_amount_cents?, limit≤50)` | Date, amount, category, sub-category |
| `get_budgets()` | Overall + category caps, current-month progress and status, 3-month averages |
| `get_insights(month)` | The ranked detector candidates from §4 |

- **Proposal tool** `propose_budget_plan({ title, overall_cents?, rows: [{ category_id, amount_cents, reason? }], allocates_overall })`
  writes nothing. The server validates it: categories are the user's active top-level categories;
  amounts obey budget limits; if `allocates_overall`, the category rows plus unchanged existing
  category budgets must add up **exactly** to `overall_cents`. Invalid → the error goes back to Claude as the
  tool result so it can fix the plan; valid → emitted as a `proposal` event with the current (`from`)
  values filled in by the server.
- **Grounding:** the system prompt requires every number to come from tool results. After each turn,
  money amounts in the answer are checked against amounts in that turn's tool results (and their pairwise
  sums/differences); mismatches are logged for review, not blocked, in v2.
- Tone: neutral analyst, same as insights. Refuses investment or credit-product advice and anything
  unrelated to the user's spending.
- Limits: 60 chat turns per user per day (`RATE_LIMITED`).

## 7. Database

```sql
CREATE TABLE budget (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES app_user(id),
    category_id   UUID REFERENCES category(id),           -- NULL = overall budget
    amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_budget_overall  ON budget (user_id)              WHERE category_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_budget_category ON budget (user_id, category_id) WHERE category_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE insight_report (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id),
    month       DATE NOT NULL CHECK (extract(day FROM month) = 1),
    facts_hash  CHAR(64) NOT NULL,
    cards       JSONB NOT NULL,
    model       VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, month)                                -- latest report per month, upserted
);
```

Application rule: a category budget must reference an active top-level category of the same user.

## 8. REST API (`/api/v1`)

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/budgets` | Overall + category budgets, each category with `avg3_cents` hint | 200 |
| PUT | `/budgets` | Replace all budgets (budgets dialog); body `{ overall_cents?, categories: [{ category_id, amount_cents }] }` | 200 |
| PATCH | `/budgets` | Change only the listed budgets (plan cards); body `{ overall_cents?, categories: [{ category_id, amount_cents \| null }] }` (`null` removes; omit `overall_cents` to leave it). Returns the new budgets plus `previous` for Undo | 200 |
| GET | `/insights?month=YYYY-MM` | Facts (summary, category changes, budgets) + cached narration or `null`, with `is_stale` | 200 |
| POST | `/insights/narration?month=YYYY-MM` | Generate/regenerate the AI cards for that month | 200 |
| POST | `/chat` | One chat turn, streamed as SSE (§6.1) | 200 |

New error codes:

| HTTP | Code | When |
|---|---|---|
| 422 | `NOT_ENOUGH_DATA` | Narration requested without data in the month and the previous month |
| 429 | `RATE_LIMITED` | Daily generation limit reached |
| 503 | `AI_UNAVAILABLE` | Provider error or output failed validation twice |
| 422 | `INVALID_BUDGET_PLAN` | `PATCH /budgets` with an unknown category or invalid amount |

## 9. Architecture

```
config/llm.py               # LLMSettings: provider = "anthropic" | "gemini" | "fake", model, api key, timeouts, daily limit
core/llm/
  base.py                   # LLMClient Protocol: generate_structured(...) -> dict; stream_turn(system, messages, tools) -> events
  anthropic.py              # AnthropicClient (only file importing the Anthropic SDK)
  gemini.py                 # GeminiClient (only file importing google-genai; free-tier option)
  fake.py                   # scripted responses for tests + keyless dev
  factory.py                # get_llm_client()
core/analytics/              # pure insights engine (no DB, no app imports): dataclasses (models.py),
                              # constants.py, detectors.py + detectors_extra.py (D1-D10), ranking.py,
                              # facts.py (facts pack + hash), validation.py (narration validator), pipeline.py
core/agents/tool_loop.py    # generic tool-use loop: takes tool specs + handlers, yields status/text/tool events
core/prompts/insights.py    # insights system prompt + facts-pack rendering
core/prompts/chat.py        # chat system prompt
core/dates.py                # SGT-aware date helpers shared by budgets, insights and core/analytics
app/budgets/                # models, schemas, service, router
app/insights/               # models (InsightReport), schemas, service (DB loading, summary/changes/
                              # budget progress, caching, rate limiting, calling core/analytics + the LLM), router
app/chat/                   # schemas, service (tool handlers calling insights/budgets services, plan validation), router (SSE)
```

`app/dependencies.py` gains `LLM = Annotated[LLMClient, Depends(get_llm_client)]`. `core` stays
unaware of app data: `app/chat/service.py` defines the tools and passes them to `core/agents`.
`app/chat/` has no `models.py` (nothing is stored).
`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` come from the environment only; startup fails fast if the
selected provider's key is missing.

## 10. Screens

4. **Insights** (`/insights`) — month switcher, summary cards, AI insight cards (with
   Refresh / out-of-date / unavailable states), "What changed" table, budget progress list.
5. **Monthly budgets** — dialog opened from Insights, with **Plan with Claude**.
6. **Chat panel** — on every page (docked / expanded / minimised).

Navigation gains an **Insights** item between Expenses and Categories.
Approved design: `docs/design/preview/ai-assistant.html` (chat + budgets dialog) and the canvas.

## 11. Testing

- Unit: every fact definition (edge cases: first month, empty months, month boundaries in SGT),
  status rules, projection, narration validator (fabricated number, unknown fact id, too many cards).
- API integration against Postgres with the `fake` LLM provider; no network in tests.
- Chat: tool handlers (scoping, no notes in any tool result), plan validation (sum must match,
  foreign category, sub-category rejected), SSE event order with a scripted fake, rate limit, `PATCH /budgets` + undo.
- A small offline eval set: fixed facts packs → real model → validator pass rate + manual review, run on demand.
- E2E: set budgets → Insights shows progress; refresh flow with the fake provider.
