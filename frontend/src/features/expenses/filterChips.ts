import type { Category } from "@/features/categories/types";
import type { DatePresetOption, ExpenseFilters } from "./useExpenseFilters";

const PRESET_LABELS: Record<Exclude<DatePresetOption, "custom">, string> = {
  last_7_days: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
  all_time: "All time",
};

const MAX_INDIVIDUAL_CATEGORY_CHIPS = 2;

export interface FilterChipDescriptor {
  key: string;
  label: string;
  kind: "date" | "category" | "category_count" | "sub_category";
  categoryId?: string;
}

/**
 * Pure description of which filter chips should show, given the current
 * filters. Doesn't know how to remove a filter -- the caller maps each
 * descriptor's `kind`/`categoryId` to an `update()` call.
 */
export function buildFilterChips(
  filters: ExpenseFilters,
  categories: Category[],
  dateRangeLabel: string
): FilterChipDescriptor[] {
  const chips: FilterChipDescriptor[] = [];

  if (filters.preset !== "this_month") {
    chips.push({
      key: "date",
      kind: "date",
      label: filters.preset === "custom" ? dateRangeLabel : PRESET_LABELS[filters.preset],
    });
  }

  if (filters.categoryIds.length > MAX_INDIVIDUAL_CATEGORY_CHIPS) {
    chips.push({ key: "cat-count", kind: "category_count", label: String(filters.categoryIds.length) });
  } else {
    for (const id of filters.categoryIds) {
      const category = categories.find((c) => c.id === id);
      if (category) {
        chips.push({ key: `cat-${id}`, kind: "category", categoryId: id, label: category.name });
      }
    }
  }

  if (filters.subCategoryId) {
    const category = categories.find((c) => c.id === filters.categoryIds[0]);
    const sub = category?.sub_categories.find((s) => s.id === filters.subCategoryId);
    if (sub) {
      chips.push({ key: "sub", kind: "sub_category", label: sub.name });
    }
  }

  return chips;
}

const CHIP_PREFIXES: Record<FilterChipDescriptor["kind"], string> = {
  date: "Date",
  category: "Category",
  category_count: "Categories",
  sub_category: "Sub-category",
};

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Turns chip descriptors into displayable, removable chips (used by both the filter bar and the empty state). */
export function resolveChipActions(
  descriptors: FilterChipDescriptor[],
  filters: ExpenseFilters,
  onChange: (patch: Partial<ExpenseFilters>) => void
): ActiveFilterChip[] {
  return descriptors.map((chip) => {
    const label = `${CHIP_PREFIXES[chip.kind]}: ${chip.label}`;
    switch (chip.kind) {
      case "date":
        return { key: chip.key, label, onRemove: () => onChange({ preset: "this_month", customFrom: null, customTo: null }) };
      case "category":
        return {
          key: chip.key,
          label,
          onRemove: () =>
            onChange({ categoryIds: filters.categoryIds.filter((id) => id !== chip.categoryId), subCategoryId: null }),
        };
      case "category_count":
        return { key: chip.key, label, onRemove: () => onChange({ categoryIds: [], subCategoryId: null }) };
      case "sub_category":
        return { key: chip.key, label, onRemove: () => onChange({ subCategoryId: null }) };
    }
  });
}
