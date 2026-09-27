import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";
import type { Expense } from "../types";

const deleteExpense = vi.fn();

vi.mock("@/features/expenses/api", () => ({
  deleteExpense: (...args: unknown[]) => deleteExpense(...args),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  listExpenses: vi.fn(),
}));

const expense: Expense = {
  id: "e1",
  amount_cents: 650,
  expense_date: "2026-09-26",
  note: "Lunch at hawker centre",
  category: { id: "cat-food", name: "Food" },
  sub_category: { id: "sub-dining", name: "Dining Out" },
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
};

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteExpenseDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeleteExpenseDialog expense={expense} onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe("DeleteExpenseDialog", () => {
  beforeEach(() => {
    deleteExpense.mockReset();
  });

  it("renders the expense summary", () => {
    renderDialog();
    expect(screen.getByText("Lunch at hawker centre")).toBeInTheDocument();
    expect(screen.getByText("Food · Dining Out · 26 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("S$6.50")).toBeInTheDocument();
  });

  it("deletes the expense and closes on confirm", async () => {
    deleteExpense.mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Delete expense" }));

    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith("e1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes without deleting on cancel", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteExpense).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an inline error and stays open when the delete request fails", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    deleteExpense.mockRejectedValue(new ApiError("NOT_FOUND", "This expense was already deleted", 404));
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Delete expense" }));

    expect(await screen.findByText("This expense was already deleted")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
