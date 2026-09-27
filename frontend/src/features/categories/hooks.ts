"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoryKeys, expenseKeys } from "@/lib/queryKeys";
import { createCategory, deleteCategory, listCategories, renameCategory, type CategoryDateRange } from "./api";
import type { CategoryInput } from "./types";

export { categoryKeys };

function invalidateCategoriesAndExpenses(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: categoryKeys.all });
  queryClient.invalidateQueries({ queryKey: expenseKeys.all });
}

/**
 * Without a range, counts are all-time (used by the Categories page). With a
 * range, `expense_count` is scoped to it (used by the expense filter bar),
 * cached under its own key so the two views don't fight over one cache entry.
 */
export function useCategories(range?: CategoryDateRange) {
  return useQuery({
    queryKey: range ? categoryKeys.scoped(range) : categoryKeys.all,
    queryFn: () => listCategories(range),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}

export function useRenameCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    // Renaming changes what expense rows display, so expenses must refetch too.
    onSuccess: () => invalidateCategoriesAndExpenses(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => invalidateCategoriesAndExpenses(queryClient),
  });
}
