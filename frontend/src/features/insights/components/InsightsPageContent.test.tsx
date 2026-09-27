import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InsightsPageContent } from "./InsightsPageContent";
import { ChatProvider } from "@/features/chat/ChatContext";
import type { InsightsOut } from "../types";
import { currentMonthKey, shiftMonthKey, monthKeyLabel } from "../monthUtils";

const getInsights = vi.fn();
const generateNarration = vi.fn();
const getBudgets = vi.fn();

vi.mock("../api", () => ({
  getInsights: (...args: unknown[]) => getInsights(...args),
  generateNarration: (...args: unknown[]) => generateNarration(...args),
}));

vi.mock("@/features/budgets/api", () => ({
  getBudgets: (...args: unknown[]) => getBudgets(...args),
  putBudgets: vi.fn(),
  patchBudgets: vi.fn(),
}));

function makeInsights(month: string): InsightsOut {
  return {
    month: `${month}-01`,
    summary: {
      total_cents: 10000,
      prev_total_cents: 9000,
      delta_vs_prev_cents: 1000,
      delta_vs_prev_pct: 11,
      avg3_cents: 9500,
      delta_vs_avg3_cents: 500,
      delta_vs_avg3_pct: 5,
      projected_cents: 11000,
      days_elapsed: 10,
      days_in_month: 30,
    },
    changes: [],
    budgets: [],
    narration: { cards: [], model: "fake", created_at: "2026-09-01T00:00:00Z" },
    is_stale: false,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider>
        <InsightsPageContent />
      </ChatProvider>
    </QueryClientProvider>
  );
}

describe("InsightsPageContent", () => {
  beforeEach(() => {
    getInsights.mockReset();
    generateNarration.mockReset();
    getBudgets.mockReset();
    getBudgets.mockResolvedValue({ overall_cents: null, categories: [] });
    getInsights.mockImplementation((month: string) => Promise.resolve(makeInsights(month)));
  });

  it("loads insights for the current month by default and renders the data-driven sections", async () => {
    renderPage();

    expect(await screen.findByText(monthKeyLabel(currentMonthKey()))).toBeInTheDocument();
    await waitFor(() => expect(getInsights).toHaveBeenCalledWith(currentMonthKey()));
    expect(await screen.findByText("What changed")).toBeInTheDocument();
    expect(screen.getByText("Category budgets")).toBeInTheDocument();
    expect(screen.getByText("Spent so far")).toBeInTheDocument();
  });

  it("loads the previous month's insights when Previous month is clicked", async () => {
    renderPage();
    await screen.findByText("What changed");

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    const prevMonth = shiftMonthKey(currentMonthKey(), -1);
    await waitFor(() => expect(getInsights).toHaveBeenCalledWith(prevMonth));
    expect(await screen.findByText(monthKeyLabel(prevMonth))).toBeInTheDocument();
  });

  it("lists categories without a budget by comparing budgets against the full category list", async () => {
    getBudgets.mockResolvedValue({
      overall_cents: null,
      categories: [
        { category_id: "cat-shop", name: "Shopping", amount_cents: null, avg3_cents: 1000 },
        { category_id: "cat-food", name: "Food", amount_cents: 45000, avg3_cents: 33000 },
      ],
    });
    getInsights.mockResolvedValue({
      ...makeInsights(currentMonthKey()),
      budgets: [
        { category_id: "cat-food", name: "Food", cap_cents: 45000, spent_cents: 40000, pct: 88, projected_cents: 42000, status: "On track" },
      ],
    });
    renderPage();

    expect(await screen.findByText("Shopping have no budget.")).toBeInTheDocument();
  });

  it("opens the budgets dialog from Edit budgets", async () => {
    renderPage();
    await screen.findByText("What changed");

    await userEvent.click(screen.getByRole("button", { name: "Edit budgets" }));

    expect(await screen.findByRole("heading", { name: "Monthly budgets" })).toBeInTheDocument();
  });
});
