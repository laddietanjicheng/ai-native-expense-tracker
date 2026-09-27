import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubCategoryFilter } from "./SubCategoryFilter";
import type { Category } from "@/features/categories/types";

const subCategories: Category[] = [
  { id: "sub-groceries", name: "Groceries", parent_id: "cat-food", expense_count: 5, sub_categories: [] },
  { id: "sub-dining", name: "Dining Out", parent_id: "cat-food", expense_count: 2, sub_categories: [] },
];

function renderFilter(props: Partial<React.ComponentProps<typeof SubCategoryFilter>> = {}) {
  const onOpenChange = vi.fn();
  const onApply = vi.fn();
  const utils = render(
    <SubCategoryFilter
      subCategories={subCategories}
      appliedId={null}
      open={false}
      onOpenChange={onOpenChange}
      onApply={onApply}
      {...props}
    />
  );
  return { ...utils, onOpenChange, onApply };
}

describe("SubCategoryFilter", () => {
  it("shows 'All' by default and the sub-category name once applied", () => {
    const { rerender } = renderFilter();
    expect(screen.getByText("· All")).toBeInTheDocument();

    rerender(
      <SubCategoryFilter
        subCategories={subCategories}
        appliedId="sub-groceries"
        open={false}
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
      />
    );
    expect(screen.getByText("· Groceries")).toBeInTheDocument();
  });

  it("lists 'All sub-categories' first, then each sub-category with its count", () => {
    renderFilter({ open: true });
    const options = screen.getAllByRole("radio").map((el) => el.textContent);
    expect(options[0]).toContain("All sub-categories");
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("applies immediately and closes when a sub-category is clicked", async () => {
    const { onApply, onOpenChange } = renderFilter({ open: true });
    await userEvent.click(screen.getByRole("radio", { name: /Groceries/ }));
    expect(onApply).toHaveBeenCalledWith("sub-groceries");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies null when 'All sub-categories' is clicked", async () => {
    const { onApply } = renderFilter({ open: true, appliedId: "sub-groceries" });
    await userEvent.click(screen.getByRole("radio", { name: "All sub-categories" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});
