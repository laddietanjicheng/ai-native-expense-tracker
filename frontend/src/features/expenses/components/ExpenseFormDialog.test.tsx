import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import type { Category } from "@/features/categories/types";

const createExpense = vi.fn();
const updateExpense = vi.fn();

vi.mock("@/features/expenses/api", () => ({
  createExpense: (...args: unknown[]) => createExpense(...args),
  updateExpense: (...args: unknown[]) => updateExpense(...args),
  deleteExpense: vi.fn(),
  listExpenses: vi.fn(),
}));

const categories: Category[] = [
  {
    id: "cat-food",
    name: "Food",
    parent_id: null,
    expense_count: 10,
    sub_categories: [
      { id: "sub-groceries", name: "Groceries", parent_id: "cat-food", expense_count: 5, sub_categories: [] },
      { id: "sub-dining", name: "Dining Out", parent_id: "cat-food", expense_count: 3, sub_categories: [] },
    ],
  },
  {
    id: "cat-transport",
    name: "Transport",
    parent_id: null,
    expense_count: 4,
    sub_categories: [{ id: "sub-taxi", name: "Taxi", parent_id: "cat-transport", expense_count: 2, sub_categories: [] }],
  },
];

function renderDialog(props: Partial<React.ComponentProps<typeof ExpenseFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExpenseFormDialog open categories={categories} onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe("ExpenseFormDialog", () => {
  beforeEach(() => {
    createExpense.mockReset();
    updateExpense.mockReset();
  });

  it("shows a validation error instead of submitting when amount is missing", async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    expect(await screen.findByText("Amount is required")).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("shows a validation error for an amount with too many decimal places", async () => {
    renderDialog();

    const amountInput = screen.getByLabelText("Amount");
    await userEvent.type(amountInput, "12.345");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    expect(
      await screen.findByText("Enter an amount greater than 0.00 with up to 2 decimal places")
    ).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("resets the sub-category when the category changes", async () => {
    renderDialog({
      expense: {
        id: "e1",
        amount_cents: 650,
        expense_date: "2026-09-26",
        note: "Lunch",
        category: { id: "cat-food", name: "Food" },
        sub_category: { id: "sub-dining", name: "Dining Out" },
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
      },
    });

    expect(screen.getByLabelText("Sub-category")).toHaveValue("sub-dining");

    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-transport");

    expect(screen.getByLabelText("Sub-category")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Taxi" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Dining Out" })).not.toBeInTheDocument();
  });

  it("submits a valid new expense with parsed amount_cents", async () => {
    createExpense.mockResolvedValue({});
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.type(screen.getByLabelText("Amount"), "12.50");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense.mock.calls[0][0]).toMatchObject({ amount_cents: 1250, category_id: "cat-food" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows the note character counter", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/Note/), "Hello");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("pre-fills the form and submits an update in edit mode", async () => {
    updateExpense.mockResolvedValue({});
    const onClose = vi.fn();
    renderDialog({
      onClose,
      expense: {
        id: "e1",
        amount_cents: 650,
        expense_date: "2026-09-26",
        note: "Lunch",
        category: { id: "cat-food", name: "Food" },
        sub_category: null,
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
      },
    });

    expect(screen.getByLabelText("Amount")).toHaveValue("6.50");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateExpense).toHaveBeenCalledTimes(1));
    expect(updateExpense).toHaveBeenCalledWith("e1", expect.objectContaining({ amount_cents: 650 }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("invokes onRequestDelete instead of submitting when Delete is clicked", async () => {
    const onRequestDelete = vi.fn();
    const expense = {
      id: "e1",
      amount_cents: 650,
      expense_date: "2026-09-26",
      note: "Lunch",
      category: { id: "cat-food", name: "Food" },
      sub_category: null,
      created_at: "2026-09-26T00:00:00Z",
      updated_at: "2026-09-26T00:00:00Z",
    };
    renderDialog({ expense, onRequestDelete });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onRequestDelete).toHaveBeenCalledWith(expense);
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it("closes without submitting on Cancel", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("maps server-side field errors from error.details.fields onto the matching form fields", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    createExpense.mockRejectedValue(
      new ApiError("VALIDATION_ERROR", "Invalid", 422, {
        fields: { amount_cents: "Must be positive", note: "Too long" },
      })
    );
    renderDialog();

    await userEvent.type(screen.getByLabelText("Amount"), "12.50");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    expect(await screen.findByText("Must be positive")).toBeInTheDocument();
    expect(screen.getByText("Too long")).toBeInTheDocument();
  });

  it("puts a model-level ('body') validation error into the root error", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    createExpense.mockRejectedValue(
      new ApiError("VALIDATION_ERROR", "Invalid", 422, { fields: { body: "Category is inactive" } })
    );
    renderDialog();

    await userEvent.type(screen.getByLabelText("Amount"), "12.50");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    expect(await screen.findByText("Category is inactive")).toBeInTheDocument();
  });

  it("puts an INVALID_SUB_CATEGORY error into the root error", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    createExpense.mockRejectedValue(
      new ApiError("INVALID_SUB_CATEGORY", "Sub-category does not belong to this category", 422)
    );
    renderDialog();

    await userEvent.type(screen.getByLabelText("Amount"), "12.50");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "cat-food");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));

    expect(await screen.findByText("Sub-category does not belong to this category")).toBeInTheDocument();
  });
});
