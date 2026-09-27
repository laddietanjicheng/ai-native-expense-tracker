import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryFilter } from "./CategoryFilter";
import type { Category } from "@/features/categories/types";

const categories: Category[] = [
  { id: "cat-food", name: "Food", parent_id: null, expense_count: 18, sub_categories: [] },
  { id: "cat-transport", name: "Transport", parent_id: null, expense_count: 7, sub_categories: [] },
  { id: "cat-health", name: "Health", parent_id: null, expense_count: 0, sub_categories: [] },
];

function renderFilter(props: Partial<React.ComponentProps<typeof CategoryFilter>> = {}) {
  const onOpenChange = vi.fn();
  const onApply = vi.fn();
  const utils = render(
    <CategoryFilter
      categories={categories}
      appliedIds={[]}
      open={false}
      onOpenChange={onOpenChange}
      onApply={onApply}
      {...props}
    />
  );
  return { ...utils, onOpenChange, onApply };
}

describe("CategoryFilter trigger", () => {
  it("shows a count badge only when categories are applied", () => {
    const { rerender } = renderFilter();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    rerender(
      <CategoryFilter
        categories={categories}
        appliedIds={["cat-food", "cat-transport"]}
        open={false}
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("CategoryFilter popover", () => {
  it("seeds the pending selection from appliedIds and shows counts", () => {
    renderFilter({ open: true, appliedIds: ["cat-food"] });
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("filters the list by the search input", async () => {
    renderFilter({ open: true });
    await userEvent.type(screen.getByLabelText("Search categories"), "trans");
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.queryByText("Food")).not.toBeInTheDocument();
  });

  it("toggles categories and updates the Apply button count", async () => {
    renderFilter({ open: true });
    await userEvent.click(screen.getByText("Food"));
    await userEvent.click(screen.getByText("Transport"));
    expect(screen.getByRole("button", { name: "Apply (2)" })).toBeInTheDocument();
  });

  it("applies the pending selection and closes on Apply", async () => {
    const { onApply, onOpenChange } = renderFilter({ open: true });
    await userEvent.click(screen.getByText("Food"));
    await userEvent.click(screen.getByRole("button", { name: "Apply (1)" }));
    expect(onApply).toHaveBeenCalledWith(["cat-food"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears the pending selection on Clear without closing", async () => {
    renderFilter({ open: true, appliedIds: ["cat-food"] });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Apply (0)" })).toBeInTheDocument();
  });

  it("keeps a zero-count category selectable", async () => {
    renderFilter({ open: true });
    await userEvent.click(screen.getByText("Health"));
    expect(screen.getByRole("button", { name: "Apply (1)" })).toBeInTheDocument();
  });
});
