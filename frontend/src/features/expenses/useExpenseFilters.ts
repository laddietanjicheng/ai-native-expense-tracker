"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveDatePreset, type DatePresetOption, type DateRange } from "@/lib/dates";
import type { SortField, SortOrder } from "./types";

export type { DatePresetOption };

export interface ExpenseFilters {
  preset: DatePresetOption;
  customFrom: string | null;
  customTo: string | null;
  categoryIds: string[];
  subCategoryId: string | null;
  sort: SortField;
  order: SortOrder;
  page: number;
}

const DEFAULT_FILTERS: ExpenseFilters = {
  preset: "this_month",
  customFrom: null,
  customTo: null,
  categoryIds: [],
  subCategoryId: null,
  sort: "date",
  order: "desc",
  page: 1,
};

const VALID_PRESETS: DatePresetOption[] = [
  "last_7_days",
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "all_time",
  "custom",
];

function parseFilters(searchParams: URLSearchParams): ExpenseFilters {
  const presetParam = searchParams.get("preset");
  const preset = VALID_PRESETS.includes(presetParam as DatePresetOption)
    ? (presetParam as DatePresetOption)
    : DEFAULT_FILTERS.preset;
  const categoryIds = searchParams.getAll("category_id");
  const sortParam = searchParams.get("sort");
  const sort: SortField = sortParam === "amount" ? "amount" : "date";
  const orderParam = searchParams.get("order");
  const order: SortOrder = orderParam === "asc" ? "asc" : "desc";
  const pageParam = Number(searchParams.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : DEFAULT_FILTERS.page;

  return {
    preset,
    customFrom: searchParams.get("date_from"),
    customTo: searchParams.get("date_to"),
    categoryIds,
    subCategoryId: categoryIds.length === 1 ? searchParams.get("sub_category_id") : null,
    sort,
    order,
    page,
  };
}

/**
 * Keeps expense filter state in the URL so it survives refresh and is
 * shareable. Reads/derives filters from the current search params and
 * exposes `update`/`clearFilters` that push a new URL.
 */
export function useExpenseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const dateRange: DateRange = useMemo(() => {
    if (filters.preset === "custom") {
      // Only apply the custom range once both dates are picked and it isn't inverted
      // (ISO "YYYY-MM-DD" strings compare correctly with <=); otherwise fall back so
      // an in-progress or invalid range never reaches the API as a 422.
      if (filters.customFrom && filters.customTo && filters.customFrom <= filters.customTo) {
        return { date_from: filters.customFrom, date_to: filters.customTo };
      }
      return resolveDatePreset("this_month");
    }
    return resolveDatePreset(filters.preset);
  }, [filters]);

  const update = useCallback(
    (patch: Partial<ExpenseFilters>, options: { resetPage?: boolean } = {}) => {
      const resetPage = options.resetPage ?? true;
      const next: ExpenseFilters = {
        ...filters,
        ...patch,
        page: resetPage ? 1 : (patch.page ?? filters.page),
      };

      const params = new URLSearchParams();
      params.set("preset", next.preset);
      if (next.preset === "custom") {
        if (next.customFrom) params.set("date_from", next.customFrom);
        if (next.customTo) params.set("date_to", next.customTo);
      }
      for (const id of next.categoryIds) {
        params.append("category_id", id);
      }
      if (next.categoryIds.length === 1 && next.subCategoryId) {
        params.set("sub_category_id", next.subCategoryId);
      }
      params.set("sort", next.sort);
      params.set("order", next.order);
      params.set("page", String(next.page));

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [filters, pathname, router]
  );

  // Sort only reorders results, so clearing filters keeps it.
  const clearFilters = useCallback(
    () =>
      update({ preset: "this_month", customFrom: null, customTo: null, categoryIds: [], subCategoryId: null }),
    [update]
  );

  return { filters, dateRange, update, clearFilters };
}
