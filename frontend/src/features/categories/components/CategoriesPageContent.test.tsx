import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoriesPageContent } from "./CategoriesPageContent";
import { useCategories } from "../hooks";
import type { Category } from "../types";

vi.mock("../hooks", () => ({
  useCategories: vi.fn(),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenameCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPageContent />
    </QueryClientProvider>
  );
}

const categories: Category[] = [
  {
    id: "cat-food",
    name: "Food",
    parent_id: null,
    expense_count: 42,
    sub_categories: [
      { id: "sub-1", name: "Groceries", parent_id: "cat-food", expense_count: 16, sub_categories: [] },
    ],
  },
];

describe("CategoriesPageContent", () => {
  it("shows a loading skeleton while fetching", () => {
    vi.mocked(useCategories).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderPage();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("shows an error state with a retry button", async () => {
    const refetch = vi.fn();
    vi.mocked(useCategories).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderPage();
    expect(screen.getByText("Could not load categories.")).toBeInTheDocument();
  });

  it("shows the category count summary and tree once loaded", () => {
    vi.mocked(useCategories).mockReturnValue({
      data: categories,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderPage();
    expect(screen.getByText("1 category · 1 sub-categories")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("opens the inline add-category row from the header button", async () => {
    vi.mocked(useCategories).mockReturnValue({
      data: categories,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderPage();
    expect(screen.queryByLabelText("New category name")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(screen.getByLabelText("New category name")).toBeInTheDocument();
  });
});
