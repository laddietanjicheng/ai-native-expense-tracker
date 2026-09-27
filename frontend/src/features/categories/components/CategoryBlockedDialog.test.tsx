import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryBlockedDialog } from "./CategoryBlockedDialog";

describe("CategoryBlockedDialog", () => {
  it("renders nothing meaningful when there is no blocked category", () => {
    render(
      <CategoryBlockedDialog categoryId={null} categoryName="" activeExpenseCount={0} onClose={vi.fn()} />
    );
    expect(screen.queryByText(/Can.t delete/)).not.toBeInTheDocument();
  });

  it("shows the category name and active expense count", () => {
    render(
      <CategoryBlockedDialog
        categoryId="cat-1"
        categoryName="Food"
        activeExpenseCount={42}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Can.t delete “Food”/)).toBeInTheDocument();
    expect(screen.getByText("42 expenses")).toBeInTheDocument();
  });

  it('uses "expense" in the singular when only one is blocking', () => {
    render(
      <CategoryBlockedDialog categoryId="cat-1" categoryName="Food" activeExpenseCount={1} onClose={vi.fn()} />
    );
    expect(screen.getByText("1 expense")).toBeInTheDocument();
  });

  it("links to the full history (all time) for the blocked category, not just this month", () => {
    render(
      <CategoryBlockedDialog
        categoryId="cat-1"
        categoryName="Food"
        activeExpenseCount={5}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: "View these expenses" })).toHaveAttribute(
      "href",
      "/?preset=all_time&category_id=cat-1"
    );
  });

  it("calls onClose when Got it is clicked", async () => {
    const onClose = vi.fn();
    render(
      <CategoryBlockedDialog categoryId="cat-1" categoryName="Food" activeExpenseCount={5} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalled();
  });
});
