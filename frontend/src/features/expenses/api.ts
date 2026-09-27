import { apiRequest } from "@/lib/apiClient";
import type { Expense, ExpenseInput, ExpenseListMeta, ExpenseListParams } from "./types";

function buildQuery(params: ExpenseListParams): string {
  const searchParams = new URLSearchParams();
  if (params.date_from) searchParams.set("date_from", params.date_from);
  if (params.date_to) searchParams.set("date_to", params.date_to);
  for (const id of params.category_id ?? []) {
    searchParams.append("category_id", id);
  }
  if (params.sub_category_id) searchParams.set("sub_category_id", params.sub_category_id);
  searchParams.set("sort", params.sort ?? "date");
  searchParams.set("order", params.order ?? "desc");
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("page_size", String(params.page_size ?? 20));
  return searchParams.toString();
}

export interface ExpenseListResult {
  items: Expense[];
  meta: ExpenseListMeta;
}

export async function listExpenses(params: ExpenseListParams): Promise<ExpenseListResult> {
  const { data, meta } = await apiRequest<Expense[]>(`/expenses?${buildQuery(params)}`);
  return { items: data, meta: meta as ExpenseListMeta };
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const { data } = await apiRequest<Expense>("/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense> {
  const { data } = await apiRequest<Expense>(`/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest<null>(`/expenses/${id}`, { method: "DELETE" });
}
