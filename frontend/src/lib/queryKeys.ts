import type { ExpenseListParams } from "@/features/expenses/types";

interface CategoryDateRange {
  date_from: string | null;
  date_to: string | null;
}

export const categoryKeys = {
  all: ["categories"] as const,
  scoped: (range: CategoryDateRange) => ["categories", "scoped", range] as const,
};

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (params: ExpenseListParams) => ["expenses", "list", params] as const,
};

export const insightsKeys = {
  all: ["insights"] as const,
  month: (month: string) => ["insights", month] as const,
};

export const budgetKeys = {
  all: ["budgets"] as const,
};
