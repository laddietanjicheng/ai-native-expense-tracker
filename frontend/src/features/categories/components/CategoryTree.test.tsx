import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTree } from "./CategoryTree";
import type { Category } from "../types";

const createCategory = vi.fn();
const deleteCategory = vi.fn();
const renameCategory = vi.fn();

vi.mock("@/features/categories/api", () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
  deleteCategory: (...args: unknown[]) => deleteCategory(...args),
  renameCategory: (...args: unknown[]) => renameCategory(...args),
  listCategories: vi.fn(),
}));

const categories: Category[] = [
  {
    id: "cat-food",
    name: "Food",
    parent_id: null,
    expense_count: 42,
    sub_categories: [
      { id: "sub-groceries", name: "Groceries", parent_id: "cat-food", expense_count: 16, sub_categories: [] },
    ],
  },
];

function renderTree(props: Partial<React.ComponentProps<typeof CategoryTree>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryTree categories={categories} showAddForm={false} onCloseAddForm={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe("CategoryTree", () => {
  beforeEach(() => {
    createCategory.mockReset();
    deleteCategory.mockReset();
    renameCategory.mockReset();
  });

  it("renders each top-level category", () => {
    renderTree();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("does not show the inline add row unless showAddForm is true", () => {
    renderTree({ showAddForm: false });
    expect(screen.queryByLabelText("New category name")).not.toBeInTheDocument();
  });

  it("creates a category from the inline add row and closes it on success", async () => {
    createCategory.mockResolvedValue({});
    const onCloseAddForm = vi.fn();
    renderTree({ showAddForm: true, onCloseAddForm });

    await userEvent.type(screen.getByLabelText("New category name"), "Travel");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createCategory).toHaveBeenCalledWith({ name: "Travel" });
    await vi.waitFor(() => expect(onCloseAddForm).toHaveBeenCalled());
  });

  it("asks for confirmation before deleting, and does nothing on cancel", async () => {
    renderTree();

    await userEvent.click(screen.getByLabelText("Delete Food"));
    expect(await screen.findByText('Delete "Food"?')).toBeInTheDocument();
    expect(screen.getByText(/also delete its 1 sub-category/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteCategory).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete "Food"?')).not.toBeInTheDocument();
  });

  it("deletes the category once the confirmation is accepted", async () => {
    deleteCategory.mockResolvedValue(undefined);
    renderTree();

    await userEvent.click(screen.getByLabelText("Delete Food"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteCategory).toHaveBeenCalledWith("cat-food");
  });

  it("shows an inline error in the confirm dialog when delete fails for a reason other than CATEGORY_IN_USE", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    deleteCategory.mockRejectedValue(new ApiError("NOT_FOUND", "Already gone", 404));
    renderTree();

    await userEvent.click(screen.getByLabelText("Delete Food"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Already gone")).toBeInTheDocument();
  });

  it("shows the CategoryBlockedDialog when delete fails with CATEGORY_IN_USE", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    deleteCategory.mockRejectedValue(new ApiError("CATEGORY_IN_USE", "In use", 409, { active_expense_count: 42 }));
    renderTree();

    await userEvent.click(screen.getByLabelText("Delete Food"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/Can.t delete “Food”/)).toBeInTheDocument();
    expect(screen.getByText("42 expenses")).toBeInTheDocument();
  });

  it("renames a category through the row's inline editor", async () => {
    renameCategory.mockResolvedValue({});
    renderTree();

    await userEvent.click(screen.getByLabelText("Rename Food"));
    const input = screen.getByLabelText("Rename Food");
    await userEvent.clear(input);
    await userEvent.type(input, "Groceries & Food{Enter}");

    expect(renameCategory).toHaveBeenCalledWith("cat-food", "Groceries & Food");
  });

  it("shows the blocked dialog naming the parent category when a sub-category delete is blocked", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    deleteCategory.mockRejectedValue(new ApiError("CATEGORY_IN_USE", "In use", 409, { active_expense_count: 16 }));
    renderTree();

    await userEvent.click(screen.getByLabelText("Expand Food"));
    await userEvent.click(screen.getByLabelText("Delete Groceries"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/Can.t delete “Food”/)).toBeInTheDocument();
    expect(screen.getAllByText("16 expenses").length).toBeGreaterThan(0);
  });
});
