"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoryKeys, expenseKeys, insightsKeys } from "@/lib/queryKeys";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "./api";
import type { ExpenseInput, ExpenseListParams } from "./types";

export { expenseKeys };

export function useExpenses(params: ExpenseListParams) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => listExpenses(params),
    placeholderData: (previous) => previous,
  });
}

function invalidateExpensesAndCategories(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: expenseKeys.all });
  queryClient.invalidateQueries({ queryKey: categoryKeys.all });
  queryClient.invalidateQueries({ queryKey: insightsKeys.all });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(input),
    onSuccess: () => invalidateExpensesAndCategories(queryClient),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExpenseInput> }) => updateExpense(id, input),
    onSuccess: () => invalidateExpensesAndCategories(queryClient),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => invalidateExpensesAndCategories(queryClient),
  });
}
