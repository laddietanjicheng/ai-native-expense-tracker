export interface BudgetRow {
  category_id: string;
  name: string;
  amount_cents: number | null;
  avg3_cents: number;
}

export interface BudgetsOut {
  overall_cents: number | null;
  categories: BudgetRow[];
}

export interface BudgetCategoryPut {
  category_id: string;
  amount_cents: number;
}

export interface BudgetPut {
  overall_cents?: number | null;
  categories: BudgetCategoryPut[];
}

export interface BudgetCategoryPatch {
  category_id: string;
  amount_cents: number | null;
}

export interface BudgetPatch {
  overall_cents?: number | null;
  categories: BudgetCategoryPatch[];
}

/** Always includes overall_cents (null when the matching PATCH left it unchanged). */
export interface PreviousBudgets {
  overall_cents: number | null;
  categories: BudgetCategoryPatch[];
}

export interface BudgetsPatchOut {
  overall_cents: number | null;
  categories: BudgetRow[];
  previous: PreviousBudgets;
}
