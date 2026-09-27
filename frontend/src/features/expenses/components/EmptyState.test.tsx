import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders active filter chips and removes one on click", async () => {
    const onRemove = vi.fn();
    render(
      <EmptyState
        chips={[{ key: "cat", label: "Health", onRemove }]}
        onClearAll={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    expect(screen.getByText("Health")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Health filter"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("calls onClearAll and onAddExpense from their buttons", async () => {
    const onClearAll = vi.fn();
    const onAddExpense = vi.fn();
    render(<EmptyState chips={[]} onClearAll={onClearAll} onAddExpense={onAddExpense} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearAll).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(onAddExpense).toHaveBeenCalled();
  });
});
