import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesTable } from "./ChangesTable";
import type { CategoryChange } from "../types";

const changes: CategoryChange[] = [
  {
    category_id: "cat-food",
    name: "Food",
    now_cents: 41230,
    prev_cents: 31020,
    delta_cents: 10210,
    sub_categories: [
      { category_id: "sub-groceries", name: "Groceries", now_cents: 20000, prev_cents: 18000, delta_cents: 2000 },
    ],
  },
  {
    category_id: "cat-health",
    name: "Health",
    now_cents: 6480,
    prev_cents: 9200,
    delta_cents: -2720,
    sub_categories: [],
  },
  {
    category_id: "cat-other",
    name: "Other",
    now_cents: 4000,
    prev_cents: 4000,
    delta_cents: 0,
    sub_categories: [],
  },
];

describe("ChangesTable", () => {
  it("shows the previous month name in the header", () => {
    render(<ChangesTable changes={changes} thisMonthLabel="Sep" prevMonthLabel="Aug" />);
    expect(screen.getByText("vs Aug")).toBeInTheDocument();
  });

  it("shows an increase, a decrease and a no-change row", () => {
    render(<ChangesTable changes={changes} thisMonthLabel="Sep" prevMonthLabel="Aug" />);

    expect(screen.getByText(/↑ S\$102\.10/)).toBeInTheDocument();
    expect(screen.getByText(/↓ S\$27\.20/)).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
  });

  it("expands a category to show its sub-categories", async () => {
    render(<ChangesTable changes={changes} thisMonthLabel="Sep" prevMonthLabel="Aug" />);

    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(screen.getByText("Groceries")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
  });

  it("shows a message when there are no changes", () => {
    render(<ChangesTable changes={[]} thisMonthLabel="Sep" prevMonthLabel="Aug" />);
    expect(screen.getByText("No spending recorded this month.")).toBeInTheDocument();
  });
});
