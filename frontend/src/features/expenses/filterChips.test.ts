import { describe, expect, it } from "vitest";
import { buildFilterChips } from "./filterChips";
import type { ExpenseFilters } from "./useExpenseFilters";
import type { Category } from "@/features/categories/types";

const categories: Category[] = [
  {
    id: "cat-food",
    name: "Food",
    parent_id: null,
    expense_count: 10,
    sub_categories: [
      { id: "sub-groceries", name: "Groceries", parent_id: "cat-food", expense_count: 5, sub_categories: [] },
    ],
  },
  { id: "cat-transport", name: "Transport", parent_id: null, expense_count: 3, sub_categories: [] },
  { id: "cat-bills", name: "Bills & Utilities", parent_id: null, expense_count: 1, sub_categories: [] },
];

function baseFilters(overrides: Partial<ExpenseFilters> = {}): ExpenseFilters {
  return {
    preset: "this_month",
    customFrom: null,
    customTo: null,
    categoryIds: [],
    subCategoryId: null,
    sort: "date",
    order: "desc",
    page: 1,
    ...overrides,
  };
}

describe("buildFilterChips", () => {
  it("returns no chips for the default this_month filters", () => {
    expect(buildFilterChips(baseFilters(), categories, "1 – 30 Sep 2026")).toEqual([]);
  });

  it("adds a date chip with the preset label for a named preset", () => {
    const chips = buildFilterChips(baseFilters({ preset: "last_month" }), categories, "1 – 31 Aug 2026");
    expect(chips).toContainEqual({ key: "date", kind: "date", label: "Last month" });
  });

  it("adds a date chip for the new last_7_days and all_time presets", () => {
    expect(buildFilterChips(baseFilters({ preset: "last_7_days" }), categories, "")).toContainEqual({
      key: "date",
      kind: "date",
      label: "Last 7 days",
    });
    expect(buildFilterChips(baseFilters({ preset: "all_time" }), categories, "")).toContainEqual({
      key: "date",
      kind: "date",
      label: "All time",
    });
  });

  it("adds a date chip with the formatted range label for a custom preset", () => {
    const chips = buildFilterChips(baseFilters({ preset: "custom" }), categories, "1 – 15 Aug 2026");
    expect(chips).toContainEqual({ key: "date", kind: "date", label: "1 – 15 Aug 2026" });
  });

  it("adds one chip per selected category when two or fewer are selected", () => {
    const chips = buildFilterChips(
      baseFilters({ categoryIds: ["cat-food", "cat-transport"] }),
      categories,
      "1 – 30 Sep 2026"
    );
    expect(chips).toContainEqual({ key: "cat-cat-food", kind: "category", categoryId: "cat-food", label: "Food" });
    expect(chips).toContainEqual({
      key: "cat-cat-transport",
      kind: "category",
      categoryId: "cat-transport",
      label: "Transport",
    });
    expect(chips.filter((c) => c.kind === "category")).toHaveLength(2);
  });

  it("omits an individual chip for a category id that doesn't resolve", () => {
    const chips = buildFilterChips(baseFilters({ categoryIds: ["missing"] }), categories, "1 – 30 Sep 2026");
    expect(chips.some((c) => c.kind === "category")).toBe(false);
  });

  it("collapses into a single count chip when more than two categories are selected", () => {
    const chips = buildFilterChips(
      baseFilters({ categoryIds: ["cat-food", "cat-transport", "cat-bills"] }),
      categories,
      "1 – 30 Sep 2026"
    );
    expect(chips).toContainEqual({ key: "cat-count", kind: "category_count", label: "3" });
    expect(chips.some((c) => c.kind === "category")).toBe(false);
  });

  it("adds a sub-category chip only when it resolves against the selected category", () => {
    const chips = buildFilterChips(
      baseFilters({ categoryIds: ["cat-food"], subCategoryId: "sub-groceries" }),
      categories,
      "1 – 30 Sep 2026"
    );
    expect(chips).toContainEqual({ key: "sub", kind: "sub_category", label: "Groceries" });
  });

  it("omits the sub-category chip when the sub-category id doesn't resolve", () => {
    const chips = buildFilterChips(
      baseFilters({ categoryIds: ["cat-food"], subCategoryId: "unknown-sub" }),
      categories,
      "1 – 30 Sep 2026"
    );
    expect(chips.some((c) => c.kind === "sub_category")).toBe(false);
  });
});
