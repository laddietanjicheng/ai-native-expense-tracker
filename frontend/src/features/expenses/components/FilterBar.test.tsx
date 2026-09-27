import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./FilterBar";
import type { ExpenseFilters } from "../useExpenseFilters";
import type { Category } from "@/features/categories/types";

vi.mock("@/lib/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates")>();
  return { ...actual, todayISOInSingapore: () => "2026-09-26" };
});

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

function renderBar(props: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const onChange = vi.fn();
  const onClearAll = vi.fn();
  const utils = render(
    <FilterBar
      filters={baseFilters()}
      categories={categories}
      dateRangeLabel="1 – 30 Sep 2026"
      totalCount={24}
      onChange={onChange}
      onClearAll={onClearAll}
      {...props}
    />
  );
  return { ...utils, onChange, onClearAll };
}

describe("FilterBar", () => {
  it("hides the applied-filters row when everything is at its default", () => {
    renderBar();
    expect(screen.queryByText(/results/)).not.toBeInTheDocument();
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("shows results, chips and Clear all once a filter is active", () => {
    renderBar({ filters: baseFilters({ preset: "last_month" }) });
    expect(screen.getByText("24 results")).toBeInTheDocument();
    expect(screen.getByText("Date: Last month")).toBeInTheDocument();
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("does not treat a non-default sort as an applied filter", () => {
    renderBar({ filters: baseFilters({ sort: "amount", order: "asc" }) });
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("only shows the sub-category button when exactly one category is applied", () => {
    const { rerender } = renderBar();
    expect(screen.queryByText("Sub-category")).not.toBeInTheDocument();

    rerender(
      <FilterBar
        filters={baseFilters({ categoryIds: ["cat-food"] })}
        categories={categories}
        dateRangeLabel="1 – 30 Sep 2026"
        totalCount={24}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText("Sub-category")).toBeInTheDocument();
  });

  it("calls onChange when a chip is removed", async () => {
    const { onChange } = renderBar({ filters: baseFilters({ categoryIds: ["cat-food"] }) });
    await userEvent.click(screen.getByLabelText("Remove Category: Food filter"));
    expect(onChange).toHaveBeenCalledWith({ categoryIds: [], subCategoryId: null });
  });

  it("calls onClearAll from the Clear all button", async () => {
    const { onClearAll } = renderBar({ filters: baseFilters({ preset: "last_month" }) });
    await userEvent.click(screen.getByText("Clear all"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("only opens one popover at a time", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Category/ }));
    expect(screen.getByRole("dialog", { name: "Filter by category" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /This month/ }));
    expect(screen.queryByRole("dialog", { name: "Filter by category" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Choose date range" })).toBeInTheDocument();
  });

  it("applies a category change through onChange", async () => {
    const { onChange } = renderBar();
    await userEvent.click(screen.getByRole("button", { name: /^Category/ }));
    await userEvent.click(screen.getByText("Food"));
    await userEvent.click(screen.getByRole("button", { name: "Apply (1)" }));
    expect(onChange).toHaveBeenCalledWith({ categoryIds: ["cat-food"], subCategoryId: null });
  });
});
