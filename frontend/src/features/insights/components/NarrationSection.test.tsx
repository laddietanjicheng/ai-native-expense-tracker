import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NarrationSection } from "./NarrationSection";
import type { InsightsOut } from "../types";

const generateNarration = vi.fn();
const patchBudgets = vi.fn();

vi.mock("../api", () => ({
  getInsights: vi.fn(),
  generateNarration: (...args: unknown[]) => generateNarration(...args),
}));

vi.mock("@/features/budgets/api", () => ({
  getBudgets: vi.fn(),
  putBudgets: vi.fn(),
  patchBudgets: (...args: unknown[]) => patchBudgets(...args),
}));

const baseInsights: InsightsOut = {
  month: "2026-09-01",
  summary: {
    total_cents: 128460,
    prev_total_cents: 114250,
    delta_vs_prev_cents: 14210,
    delta_vs_prev_pct: 12,
    avg3_cents: 119000,
    delta_vs_avg3_cents: 9460,
    delta_vs_avg3_pct: 8,
    projected_cents: 148223,
    days_elapsed: 26,
    days_in_month: 30,
  },
  changes: [],
  budgets: [],
  narration: null,
  is_stale: false,
};

function renderSection(insights: InsightsOut) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NarrationSection monthKey="2026-09" insights={insights} />
    </QueryClientProvider>
  );
}

describe("NarrationSection", () => {
  beforeEach(() => {
    generateNarration.mockReset();
  });

  it("automatically generates narration once when it is null", async () => {
    generateNarration.mockResolvedValue({ ...baseInsights, narration: { cards: [], model: "fake", created_at: "2026-09-26T02:42:00Z" } });
    renderSection(baseInsights);

    await waitFor(() => expect(generateNarration).toHaveBeenCalledWith("2026-09"));
    expect(generateNarration).toHaveBeenCalledTimes(1);
  });

  it("does not auto-generate when narration is already present", async () => {
    const insights = { ...baseInsights, narration: { cards: [], model: "fake", created_at: "2026-09-26T02:42:00Z" } };
    renderSection(insights);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(generateNarration).not.toHaveBeenCalled();
  });

  it("shows the amber stale notice when is_stale is true and narration exists", () => {
    const insights = {
      ...baseInsights,
      is_stale: true,
      narration: { cards: [], model: "fake", created_at: "2026-09-26T02:42:00Z" },
    };
    renderSection(insights);

    expect(screen.getByText(/expenses changed since this summary was written/)).toBeInTheDocument();
  });

  it("explains what's missing on NOT_ENOUGH_DATA", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    generateNarration.mockRejectedValue(new ApiError("NOT_ENOUGH_DATA", "Not enough data", 422));
    renderSection(baseInsights);

    expect(await screen.findByText(/expense in this month and in the previous month/)).toBeInTheDocument();
  });

  it("shows a rate-limit message on RATE_LIMITED", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    generateNarration.mockRejectedValue(new ApiError("RATE_LIMITED", "Rate limited", 429));
    renderSection(baseInsights);

    expect(await screen.findByText(/limit for AI summaries has been reached/i)).toBeInTheDocument();
  });

  it("shows the unavailable state and a Try again button on AI_UNAVAILABLE", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    generateNarration.mockRejectedValue(new ApiError("AI_UNAVAILABLE", "unavailable", 503));
    renderSection(baseInsights);

    expect(await screen.findByText(/written summary isn't available right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("regenerates when Refresh is clicked", async () => {
    const insights = { ...baseInsights, narration: { cards: [], model: "fake", created_at: "2026-09-26T02:42:00Z" } };
    generateNarration.mockResolvedValue(insights);
    renderSection(insights);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(generateNarration).toHaveBeenCalledWith("2026-09"));
  });

  it("renders cards with a type chip, title and body", () => {
    const insights: InsightsOut = {
      ...baseInsights,
      narration: {
        model: "fake",
        created_at: "2026-09-26T02:42:00Z",
        cards: [{ type: "change", title: "Dining out drove the increase", body: "Up S$96.40", fact_ids: ["F1"], proposal: null }],
      },
    };
    renderSection(insights);

    expect(screen.getByText("Change")).toBeInTheDocument();
    expect(screen.getByText("Dining out drove the increase")).toBeInTheDocument();
    expect(screen.getByText("Up S$96.40")).toBeInTheDocument();
  });

  it("auto-generates for a newly viewed month even while the previous month's generation is still pending", async () => {
    generateNarration.mockImplementation((month: string) => {
      if (month === "2026-08") return new Promise<InsightsOut>(() => {}); // never settles
      return Promise.resolve({ ...baseInsights, narration: { cards: [], model: "fake", created_at: "2026-09-26T00:00:00Z" } });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NarrationSection monthKey="2026-08" insights={{ ...baseInsights, narration: null }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(generateNarration).toHaveBeenCalledWith("2026-08"));

    rerender(
      <QueryClientProvider client={queryClient}>
        <NarrationSection monthKey="2026-09" insights={{ ...baseInsights, narration: null }} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(generateNarration).toHaveBeenCalledWith("2026-09"));
  });

  it("does not show a stale error from a previous month while viewing a month with valid narration", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    generateNarration.mockImplementation((month: string) =>
      month === "2026-08" ? Promise.reject(new ApiError("AI_UNAVAILABLE", "unavailable", 503)) : Promise.resolve(baseInsights)
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NarrationSection monthKey="2026-08" insights={{ ...baseInsights, narration: null }} />
      </QueryClientProvider>
    );

    await screen.findByText(/written summary isn't available right now/);

    rerender(
      <QueryClientProvider client={queryClient}>
        <NarrationSection
          monthKey="2026-09"
          insights={{ ...baseInsights, narration: { cards: [], model: "fake", created_at: "2026-09-26T00:00:00Z" } }}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByText(/written summary isn't available right now/)).not.toBeInTheDocument();
  });

  it("renders a PlanCard when a card carries a proposal", () => {
    const insights: InsightsOut = {
      ...baseInsights,
      narration: {
        model: "fake",
        created_at: "2026-09-26T02:42:00Z",
        cards: [
          {
            type: "budget",
            title: "Lower your Food cap",
            body: "You have been under budget for 3 months.",
            fact_ids: ["F2"],
            proposal: {
              title: "Lower Food budget",
              footer: "Frees up S$50.00 a month",
              rows: [{ category_id: "cat-food", name: "Food", from_cents: 45000, to_cents: 40000, reason: null }],
            },
          },
        ],
      },
    };
    renderSection(insights);

    expect(screen.getByText("Lower Food budget")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("does not leak a PlanCard's applied state onto an unrelated card that lands at the same position after Refresh", async () => {
    patchBudgets.mockResolvedValue({ overall_cents: null, categories: [], previous: { overall_cents: null, categories: [] } });
    const withProposal: InsightsOut = {
      ...baseInsights,
      narration: {
        model: "fake",
        created_at: "2026-09-26T00:00:00Z",
        cards: [
          {
            type: "budget",
            title: "Lower your Food cap",
            body: "Under budget for 3 months.",
            fact_ids: ["F1"],
            proposal: { title: "Lower Food budget", footer: "", rows: [{ category_id: "cat-food", name: "Food", from_cents: 45000, to_cents: 40000, reason: null }] },
          },
        ],
      },
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NarrationSection monthKey="2026-09" insights={withProposal} />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Budgets updated");

    // Refresh returns a completely different card (no proposal) occupying the same array index.
    const unrelatedCard: InsightsOut = {
      ...baseInsights,
      narration: {
        model: "fake",
        created_at: "2026-09-26T01:00:00Z",
        cards: [{ type: "leak", title: "Frequent small purchases", body: "Many small buys.", fact_ids: ["F9"], proposal: null }],
      },
    };
    rerender(
      <QueryClientProvider client={queryClient}>
        <NarrationSection monthKey="2026-09" insights={unrelatedCard} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Frequent small purchases")).toBeInTheDocument();
    expect(screen.queryByText("Budgets updated")).not.toBeInTheDocument();
    expect(screen.queryByText("Lower Food budget")).not.toBeInTheDocument();
  });
});
