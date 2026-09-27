import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanCard } from "./PlanCard";
import type { Proposal } from "@/features/insights/types";

const patchBudgets = vi.fn();

vi.mock("../api", () => ({
  getBudgets: vi.fn(),
  putBudgets: vi.fn(),
  patchBudgets: (...args: unknown[]) => patchBudgets(...args),
}));

const proposal: Proposal = {
  title: "Rebalance your budgets",
  footer: "Keeps your overall cap the same",
  rows: [
    { category_id: "cat-food", name: "Food", from_cents: 45000, to_cents: 40000, reason: "Trending under cap" },
    { category_id: "cat-shop", name: "Shopping", from_cents: null, to_cents: 5000, reason: null },
  ],
};

function renderCard(p: Proposal = proposal) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanCard proposal={p} />
    </QueryClientProvider>
  );
}

describe("PlanCard", () => {
  beforeEach(() => {
    patchBudgets.mockReset();
  });

  it("shows struck-through old amounts and the new amounts", () => {
    renderCard();

    expect(screen.getByText("S$450.00")).toBeInTheDocument();
    expect(screen.getByText("S$400.00")).toBeInTheDocument();
    expect(screen.getByText("Trending under cap")).toBeInTheDocument();
  });

  it("applies the plan and shows Undo, sending the proposal rows as a PATCH payload", async () => {
    // The real API always serializes previous.overall_cents (null when untouched).
    patchBudgets.mockResolvedValue({
      overall_cents: null,
      categories: [],
      previous: {
        overall_cents: null,
        categories: [{ category_id: "cat-food", amount_cents: 45000 }, { category_id: "cat-shop", amount_cents: null }],
      },
    });
    renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.getByText("Budgets updated")).toBeInTheDocument());
    expect(patchBudgets).toHaveBeenCalledWith({
      categories: [
        { category_id: "cat-food", amount_cents: 40000 },
        { category_id: "cat-shop", amount_cents: 5000 },
      ],
    });
  });

  it("does not wipe the overall budget on Undo for a category-only proposal, even though the server echoes overall_cents: null", async () => {
    const previous = {
      overall_cents: null,
      categories: [
        { category_id: "cat-food", amount_cents: 45000 },
        { category_id: "cat-shop", amount_cents: null },
      ],
    };
    patchBudgets.mockResolvedValueOnce({ overall_cents: null, categories: [], previous });
    patchBudgets.mockResolvedValueOnce({ overall_cents: null, categories: [], previous: { overall_cents: null, categories: [] } });
    renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Budgets updated");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(screen.getByText("Undone. Your budgets are back as they were.")).toBeInTheDocument());
    const undoPayload = patchBudgets.mock.calls[1][0];
    expect(undoPayload).not.toHaveProperty("overall_cents");
    expect(undoPayload).toEqual({
      categories: [
        { category_id: "cat-food", amount_cents: 45000 },
        { category_id: "cat-shop", amount_cents: null },
      ],
    });
  });

  it("does include overall_cents on Undo when the original proposal touched the overall budget", async () => {
    const previous = { overall_cents: 150000, categories: [] };
    patchBudgets.mockResolvedValueOnce({ overall_cents: 100000, categories: [], previous });
    patchBudgets.mockResolvedValueOnce({ overall_cents: 150000, categories: [], previous: { overall_cents: 100000, categories: [] } });
    renderCard({
      title: "Cut spending",
      footer: "",
      rows: [{ category_id: null, name: "Overall", from_cents: 150000, to_cents: 100000, reason: null }],
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Budgets updated");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(patchBudgets).toHaveBeenLastCalledWith({ overall_cents: 150000, categories: [] }));
  });

  it("ignores a second Apply click while the first request is still pending", async () => {
    let resolvePatch: (value: unknown) => void = () => {};
    patchBudgets.mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve;
      })
    );
    renderCard();

    const applyButton = screen.getByRole("button", { name: "Apply" });
    await userEvent.click(applyButton);
    await userEvent.click(applyButton);

    expect(patchBudgets).toHaveBeenCalledTimes(1);
    resolvePatch({ overall_cents: null, categories: [], previous: { overall_cents: null, categories: [] } });
    await waitFor(() => expect(screen.getByText("Budgets updated")).toBeInTheDocument());
  });

  it("dismisses the plan without calling the API", async () => {
    renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.getByText("Dismissed. No changes made.")).toBeInTheDocument();
    expect(patchBudgets).not.toHaveBeenCalled();
  });

  it("shows an error message when applying fails", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    patchBudgets.mockRejectedValue(new ApiError("INVALID_BUDGET_PLAN", "Unknown category", 422));
    renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Unknown category")).toBeInTheDocument();
  });

  it("sends overall_cents when the proposal includes an overall row", async () => {
    patchBudgets.mockResolvedValue({ overall_cents: 100000, categories: [], previous: { overall_cents: 150000, categories: [] } });
    renderCard({
      title: "Cut spending",
      footer: "",
      rows: [{ category_id: null, name: "Overall", from_cents: 150000, to_cents: 100000, reason: null }],
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(patchBudgets).toHaveBeenCalledWith({ overall_cents: 100000, categories: [] })
    );
  });
});
