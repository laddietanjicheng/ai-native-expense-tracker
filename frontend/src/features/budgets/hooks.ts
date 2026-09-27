"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetKeys, insightsKeys } from "@/lib/queryKeys";
import { getBudgets, patchBudgets, putBudgets } from "./api";
import type { BudgetPatch, BudgetPut } from "./types";

export { budgetKeys };

function invalidateBudgetsAndInsights(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: budgetKeys.all });
  queryClient.invalidateQueries({ queryKey: insightsKeys.all });
}

export function useBudgets() {
  return useQuery({
    queryKey: budgetKeys.all,
    queryFn: () => getBudgets(),
  });
}

export function usePutBudgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetPut) => putBudgets(input),
    onSuccess: () => invalidateBudgetsAndInsights(queryClient),
  });
}

export function usePatchBudgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetPatch) => patchBudgets(input),
    onSuccess: () => invalidateBudgetsAndInsights(queryClient),
  });
}
