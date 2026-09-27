import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExpensesPageContent } from "./ExpensesPageContent";
import { useExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense } from "../hooks";
import { useExpenseFilters } from "../useExpenseFilters";
import { useCategories } from "@/features/categories/hooks";
import type { Category } from "@/features/categories/types";
import type { Expense } from "../types";

vi.mock("../hooks", () => ({
  useExpenses: vi.fn(),
  useCreateExpense: vi.fn(),
  useUpdateExpense: vi.fn(),
  useDeleteExpense: vi.fn(),
}));

vi.mock("../useExpenseFilters", () => ({
  useExpenseFilters: vi.fn(),
}));

vi.mock("@/features/categories/hooks", () => ({
  useCategories: vi.fn(),
}));

const categories: Category[] = [
  { id: "cat-food", name: "Food", parent_id: null, expense_count: 10, sub_categories: [] },
];

const expense: Expense = {
  id: "e1",
  amount_cents: 650,
  expense_date: "2026-09-26",
  note: "Lunch",
  category: { id: "cat-food", name: "Food" },
  sub_category: null,
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
};

const noopMutation = { mutateAsync: vi.fn(), isPending: false };

function setUpDefaultMocks() {
  vi.mocked(useCategories).mockReturnValue({ data: categories, isLoading: false, isError: false } as never);
  vi.mocked(useCreateExpense).mockReturnValue(noopMutation as never);
  vi.mocked(useUpdateExpense).mockReturnValue(noopMutation as never);
  vi.mocked(useDeleteExpense).mockReturnValue(noopMutation as never);
  vi.mocked(useExpenseFilters).mockReturnValue({
    filters: {
      preset: "this_month",
      customFrom: null,
      customTo: null,
      categoryIds: [],
      subCategoryId: null,
      sort: "date",
      order: "desc",
      page: 1,
    },
    dateRange: { date_from: "2026-09-01", date_to: "2026-09-30" },
    update: vi.fn(),
    clearFilters: vi.fn(),
  } as never);
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExpensesPageContent />
    </QueryClientProvider>
  );
}

describe("ExpensesPageContent", () => {
  it("shows summary cards and the expense list when data loads", () => {
    setUpDefaultMocks();
    vi.mocked(useExpenses).mockReturnValue({
      data: {
        items: [expense],
        meta: { page: 1, page_size: 20, total_count: 1, total_amount_cents: 650, category_count: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(screen.getByRole("heading", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getAllByText("S$6.50").length).toBeGreaterThan(0);
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("shows the empty state when there are no results", () => {
    setUpDefaultMocks();
    vi.mocked(useExpenses).mockReturnValue({
      data: { items: [], meta: { page: 1, page_size: 20, total_count: 0, total_amount_cents: 0, category_count: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(screen.getByText("No expenses match these filters")).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    setUpDefaultMocks();
    const refetch = vi.fn();
    vi.mocked(useExpenses).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);

    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("opens the add expense dialog from the header button", async () => {
    setUpDefaultMocks();
    vi.mocked(useExpenses).mockReturnValue({
      data: {
        items: [expense],
        meta: { page: 1, page_size: 20, total_count: 1, total_amount_cents: 650, category_count: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.getByRole("heading", { name: "Add expense" })).toBeInTheDocument();
  });
});
