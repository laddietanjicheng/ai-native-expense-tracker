import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryBudgetsList } from "./CategoryBudgetsList";
import type { BudgetProgress } from "../types";

const overBudget: BudgetProgress = {
  category_id: "cat-ent",
  name: "Entertainment",
  cap_cents: 12000,
  spent_cents: 13660,
  pct: 114,
  projected_cents: null,
  status: "Over",
};

const riskBudget: BudgetProgress = {
  category_id: "cat-food",
  name: "Food",
  cap_cents: 45000,
  spent_cents: 41230,
  pct: 92,
  projected_cents: 47573,
  status: "At risk",
};

describe("CategoryBudgetsList", () => {
  it("shows the over-budget note as an amount over the cap", () => {
    render(<CategoryBudgetsList budgets={[overBudget]} categoriesWithoutBudget={[]} onEdit={vi.fn()} />);

    expect(screen.getByText("Over")).toBeInTheDocument();
    expect(screen.getByText("S$16.60 over")).toBeInTheDocument();
  });

  it("shows a projected total for an at-risk budget", () => {
    render(<CategoryBudgetsList budgets={[riskBudget]} categoriesWithoutBudget={[]} onEdit={vi.fn()} />);

    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText("Projected S$475.73")).toBeInTheDocument();
  });

  it("lists categories without a budget", () => {
    render(<CategoryBudgetsList budgets={[]} categoriesWithoutBudget={["Shopping", "Health"]} onEdit={vi.fn()} />);
    expect(screen.getByText("Shopping, Health have no budget.")).toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<CategoryBudgetsList budgets={[riskBudget]} categoriesWithoutBudget={[]} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
  });
});
