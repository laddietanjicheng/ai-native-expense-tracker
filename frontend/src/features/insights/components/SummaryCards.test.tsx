import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryCards } from "./SummaryCards";
import type { SummaryOut } from "../types";

const baseSummary: SummaryOut = {
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
};

describe("SummaryCards", () => {
  it("shows the increase vs previous month with an up arrow", () => {
    render(<SummaryCards summary={baseSummary} overallBudget={undefined} monthKey="2026-09" onEditBudgets={vi.fn()} />);

    expect(screen.getByText("S$1,284.60")).toBeInTheDocument();
    expect(screen.getByText(/S\$142\.10 \(12%\) more than Aug/)).toBeInTheDocument();
  });

  it("shows a decrease vs previous month with a down direction", () => {
    render(
      <SummaryCards
        summary={{ ...baseSummary, delta_vs_prev_cents: -5000, delta_vs_prev_pct: -4 }}
        overallBudget={undefined}
        monthKey="2026-09"
        onEditBudgets={vi.fn()}
      />
    );

    expect(screen.getByText(/S\$50\.00 \(4%\) less than Aug/)).toBeInTheDocument();
  });

  it("shows 'No change' when the delta is zero", () => {
    render(
      <SummaryCards
        summary={{ ...baseSummary, delta_vs_prev_cents: 0, delta_vs_prev_pct: 0 }}
        overallBudget={undefined}
        monthKey="2026-09"
        onEditBudgets={vi.fn()}
      />
    );

    expect(screen.getByText("No change from Aug")).toBeInTheDocument();
  });

  it("shows the projected month-end total and days elapsed for the current month", () => {
    render(<SummaryCards summary={baseSummary} overallBudget={undefined} monthKey="2026-09" onEditBudgets={vi.fn()} />);

    expect(screen.getByText("Projected month-end")).toBeInTheDocument();
    expect(screen.getByText("S$1,482.23")).toBeInTheDocument();
    expect(screen.getByText(/Day 26 of 30/)).toBeInTheDocument();
  });

  it("shows the month total instead of a projection for a past month", () => {
    render(<SummaryCards summary={baseSummary} overallBudget={undefined} monthKey="2020-01" onEditBudgets={vi.fn()} />);

    expect(screen.getByText("Month total")).toBeInTheDocument();
    expect(screen.queryByText(/Day 26 of 30/)).not.toBeInTheDocument();
  });

  it("shows the overall budget status, percentage and progress bar", () => {
    render(
      <SummaryCards
        summary={baseSummary}
        overallBudget={{
          category_id: null,
          name: "Overall",
          cap_cents: 150000,
          spent_cents: 128460,
          pct: 86,
          projected_cents: 148223,
          status: "On track",
        }}
        monthKey="2026-09"
        onEditBudgets={vi.fn()}
      />
    );

    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText(/86%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Overall budget used" })).toHaveAttribute("aria-valuenow", "86");
  });

  it("prompts to set an overall budget when none exists", async () => {
    const onEditBudgets = vi.fn();
    render(<SummaryCards summary={baseSummary} overallBudget={undefined} monthKey="2026-09" onEditBudgets={onEditBudgets} />);

    expect(screen.getByText("No overall budget set yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set a budget" }));
    expect(onEditBudgets).toHaveBeenCalled();
  });
});
