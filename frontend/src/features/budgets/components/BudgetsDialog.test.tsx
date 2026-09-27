import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BudgetsDialog } from "./BudgetsDialog";
import { ChatProvider } from "@/features/chat/ChatContext";
import { ChatPanel } from "@/features/chat/components/ChatPanel";
import type { BudgetsOut } from "../types";

const getBudgets = vi.fn();
const putBudgets = vi.fn();

vi.mock("../api", () => ({
  getBudgets: (...args: unknown[]) => getBudgets(...args),
  putBudgets: (...args: unknown[]) => putBudgets(...args),
  patchBudgets: vi.fn(),
}));

const budgetsData: BudgetsOut = {
  overall_cents: 150000,
  categories: [
    { category_id: "cat-food", name: "Food", amount_cents: 45000, avg3_cents: 33040 },
    { category_id: "cat-health", name: "Health", amount_cents: null, avg3_cents: 8150 },
  ],
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider>
        <BudgetsDialog open onClose={vi.fn()} />
      </ChatProvider>
    </QueryClientProvider>
  );
}

describe("BudgetsDialog", () => {
  beforeEach(() => {
    getBudgets.mockReset();
    putBudgets.mockReset();
    getBudgets.mockResolvedValue(budgetsData);
  });

  it("pre-fills the overall amount and each category's amount and average hint", async () => {
    renderDialog();

    expect(await screen.findByDisplayValue("1500.00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("450.00")).toBeInTheDocument();
    expect(screen.getByText("Avg S$330.40 / month")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
  });

  it("rejects an amount with more than 2 decimal places", async () => {
    renderDialog();
    const overallInput = await screen.findByLabelText("Overall");

    await userEvent.clear(overallInput);
    await userEvent.type(overallInput, "12.345");
    await userEvent.click(screen.getByRole("button", { name: "Save budgets" }));

    expect(await screen.findByText("Enter an amount greater than 0.00 with up to 2 decimal places")).toBeInTheDocument();
    expect(putBudgets).not.toHaveBeenCalled();
  });

  it("saves with a blank field treated as no budget", async () => {
    putBudgets.mockResolvedValue(budgetsData);
    renderDialog();
    await screen.findByDisplayValue("1500.00");

    await userEvent.click(screen.getByRole("button", { name: "Save budgets" }));

    await waitFor(() => expect(putBudgets).toHaveBeenCalledTimes(1));
    expect(putBudgets).toHaveBeenCalledWith({
      overall_cents: 150000,
      categories: [{ category_id: "cat-food", amount_cents: 45000 }],
    });
  });

  it("closes without saving on Cancel", async () => {
    const onClose = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ChatProvider>
          <BudgetsDialog open onClose={onClose} />
        </ChatProvider>
      </QueryClientProvider>
    );
    await screen.findByDisplayValue("1500.00");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(putBudgets).not.toHaveBeenCalled();
  });

  it("Plan with Claude closes the dialog and pre-fills the chat composer with the cursor after S$", async () => {
    const onClose = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ChatProvider>
          <BudgetsDialog open onClose={onClose} />
          <ChatPanel />
        </ChatProvider>
      </QueryClientProvider>
    );
    await screen.findByDisplayValue("1500.00");

    await userEvent.click(screen.getByRole("button", { name: "Plan with Claude" }));

    expect(onClose).toHaveBeenCalled();
    const composer = screen.getByLabelText("Ask a question") as HTMLTextAreaElement;
    expect(composer.value).toBe("I want to spend at most S$ this month. How should I split it?");
    expect(composer.selectionStart).toBe(composer.value.indexOf("S$") + 2);
  });
});
