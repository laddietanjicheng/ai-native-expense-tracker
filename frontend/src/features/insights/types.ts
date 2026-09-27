export type BudgetStatus = "Over" | "At risk" | "On track";

export type CardType =
  | "pace"
  | "change"
  | "leak"
  | "recurring"
  | "timing"
  | "trend"
  | "budget"
  | "anomaly"
  | "win"
  | "logging"
  | "tip";

export interface SummaryOut {
  total_cents: number;
  prev_total_cents: number;
  delta_vs_prev_cents: number;
  delta_vs_prev_pct: number | null;
  avg3_cents: number;
  delta_vs_avg3_cents: number;
  delta_vs_avg3_pct: number | null;
  projected_cents: number | null;
  days_elapsed: number;
  days_in_month: number;
}

export interface SubCategoryChange {
  category_id: string;
  name: string;
  now_cents: number;
  prev_cents: number;
  delta_cents: number;
}

export interface CategoryChange {
  category_id: string;
  name: string;
  now_cents: number;
  prev_cents: number;
  delta_cents: number;
  sub_categories: SubCategoryChange[];
}

export interface BudgetProgress {
  category_id: string | null;
  name: string;
  cap_cents: number;
  spent_cents: number;
  pct: number;
  projected_cents: number | null;
  status: BudgetStatus;
}

export interface ProposalRow {
  category_id: string | null;
  name: string;
  from_cents: number | null;
  to_cents: number;
  reason: string | null;
}

export interface Proposal {
  title: string;
  rows: ProposalRow[];
  footer: string;
}

export interface Card {
  type: CardType;
  title: string;
  body: string;
  fact_ids: string[];
  proposal: Proposal | null;
}

export interface Narration {
  cards: Card[];
  model: string;
  created_at: string;
}

export interface InsightsOut {
  month: string;
  summary: SummaryOut;
  changes: CategoryChange[];
  budgets: BudgetProgress[];
  narration: Narration | null;
  is_stale: boolean;
}
