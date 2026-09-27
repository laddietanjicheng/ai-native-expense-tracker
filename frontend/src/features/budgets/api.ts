import { apiRequest } from "@/lib/apiClient";
import type { BudgetPatch, BudgetPut, BudgetsOut, BudgetsPatchOut } from "./types";

export async function getBudgets(): Promise<BudgetsOut> {
  const { data } = await apiRequest<BudgetsOut>("/budgets");
  return data;
}

export async function putBudgets(input: BudgetPut): Promise<BudgetsOut> {
  const { data } = await apiRequest<BudgetsOut>("/budgets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return data;
}

export async function patchBudgets(input: BudgetPatch): Promise<BudgetsPatchOut> {
  const { data } = await apiRequest<BudgetsPatchOut>("/budgets", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data;
}
