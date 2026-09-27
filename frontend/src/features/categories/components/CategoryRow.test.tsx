import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryRow } from "./CategoryRow";
import type { Category } from "../types";

const category: Category = {
  id: "cat-food",
  name: "Food",
  parent_id: null,
  expense_count: 42,
  sub_categories: [
    { id: "sub-groceries", name: "Groceries", parent_id: "cat-food", expense_count: 16, sub_categories: [] },
  ],
};

function renderRow(overrides: Partial<React.ComponentProps<typeof CategoryRow>> = {}) {
  return render(
    <CategoryRow
      category={category}
      expanded={false}
      onToggleExpand={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onDeleteSub={vi.fn()}
      onCreateSub={vi.fn()}
      {...overrides}
    />
  );
}

describe("CategoryRow", () => {
  it("shows the category name and summary", () => {
    renderRow();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("1 sub-category · 42 expenses")).toBeInTheDocument();
  });

  it("does not render sub-categories when collapsed", () => {
    renderRow({ expanded: false });
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
  });

  it("renders sub-categories and the add-sub-category row when expanded", () => {
    renderRow({ expanded: true });
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Add sub-category")).toBeInTheDocument();
    expect(screen.getByText("1 of 50 used")).toBeInTheDocument();
  });

  it("calls onToggleExpand when the expand button is clicked", async () => {
    const onToggleExpand = vi.fn();
    renderRow({ onToggleExpand });
    await userEvent.click(screen.getByLabelText("Expand Food"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("calls onDelete when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    renderRow({ onDelete });
    await userEvent.click(screen.getByLabelText("Delete Food"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("renames the category on Enter", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    renderRow({ onRename });

    await userEvent.click(screen.getByLabelText("Rename Food"));
    const input = screen.getByLabelText("Rename Food");
    await userEvent.clear(input);
    await userEvent.type(input, "Groceries & Food{Enter}");

    expect(onRename).toHaveBeenCalledWith("cat-food", "Groceries & Food");
  });

  it("creates a sub-category on Enter and clears the input", async () => {
    const onCreateSub = vi.fn().mockResolvedValue(undefined);
    renderRow({ expanded: true, onCreateSub });

    await userEvent.click(screen.getByText("Add sub-category"));
    const input = screen.getByLabelText("New sub-category in Food");
    await userEvent.type(input, "Snacks{Enter}");

    expect(onCreateSub).toHaveBeenCalledWith("Snacks");
  });

  it("disables adding a sub-category once the limit is reached", () => {
    const fullCategory: Category = {
      ...category,
      sub_categories: Array.from({ length: 50 }, (_, i) => ({
        id: `sub-${i}`,
        name: `Sub ${i}`,
        parent_id: "cat-food",
        expense_count: 0,
        sub_categories: [],
      })),
    };
    renderRow({ category: fullCategory, expanded: true });
    expect(screen.getByText("Add sub-category").closest("button")).toBeDisabled();
  });
});
