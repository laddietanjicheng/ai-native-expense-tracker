import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { groupExpensesByDay, ExpenseList } from "./ExpenseList";
import type { Expense } from "../types";

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: "1",
    amount_cents: 1000,
    expense_date: "2026-09-26",
    note: "Test",
    category: { id: "cat-1", name: "Food" },
    sub_category: null,
    created_at: "2026-09-26T00:00:00Z",
    updated_at: "2026-09-26T00:00:00Z",
    ...overrides,
  };
}

describe("groupExpensesByDay", () => {
  it("groups items by expense_date and sums each day's total", () => {
    const items = [
      makeExpense({ id: "1", expense_date: "2026-09-26", amount_cents: 650 }),
      makeExpense({ id: "2", expense_date: "2026-09-26", amount_cents: 180 }),
      makeExpense({ id: "3", expense_date: "2026-09-25", amount_cents: 8645 }),
    ];

    const groups = groupExpensesByDay(items);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ dateISO: "2026-09-26", totalCents: 830 });
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1]).toMatchObject({ dateISO: "2026-09-25", totalCents: 8645 });
  });

  it("preserves the input order of distinct days", () => {
    const items = [
      makeExpense({ id: "1", expense_date: "2026-09-24" }),
      makeExpense({ id: "2", expense_date: "2026-09-26" }),
      makeExpense({ id: "3", expense_date: "2026-09-25" }),
    ];

    const groups = groupExpensesByDay(items);

    expect(groups.map((g) => g.dateISO)).toEqual(["2026-09-24", "2026-09-26", "2026-09-25"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupExpensesByDay([])).toEqual([]);
  });
});

describe("ExpenseList", () => {
  it("renders a day header with its formatted label and total", () => {
    const items = [makeExpense({ expense_date: "2026-09-26", amount_cents: 650, note: "Lunch" })];
    render(<ExpenseList items={items} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Saturday, 26 Sep")).toBeInTheDocument();
    expect(screen.getAllByText("S$6.50")).toHaveLength(2);
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("shows category and sub-category as meta text", () => {
    const items = [
      makeExpense({
        note: "Kopi",
        category: { id: "cat-1", name: "Food" },
        sub_category: { id: "sub-1", name: "Coffee & Snacks" },
      }),
    ];
    render(<ExpenseList items={items} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Food · Coffee & Snacks")).toBeInTheDocument();
  });
});
