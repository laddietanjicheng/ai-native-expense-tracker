import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubCategoryRow } from "./SubCategoryRow";
import type { Category } from "../types";

const sub: Category = {
  id: "sub-1",
  name: "Groceries",
  parent_id: "cat-1",
  expense_count: 16,
  sub_categories: [],
};

describe("SubCategoryRow", () => {
  it("shows the name and expense count", () => {
    render(<SubCategoryRow sub={sub} onRename={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("16 expenses")).toBeInTheDocument();
  });

  it("calls onDelete when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    render(<SubCategoryRow sub={sub} onRename={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText("Delete Groceries"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("enters rename mode, saves a new name on Enter", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(<SubCategoryRow sub={sub} onRename={onRename} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByLabelText("Rename Groceries"));
    const input = screen.getByLabelText("Rename Groceries");
    await userEvent.clear(input);
    await userEvent.type(input, "Fresh Produce{Enter}");

    expect(onRename).toHaveBeenCalledWith("sub-1", "Fresh Produce");
  });

  it("cancels rename on Escape without calling onRename", async () => {
    const onRename = vi.fn();
    render(<SubCategoryRow sub={sub} onRename={onRename} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByLabelText("Rename Groceries"));
    const input = screen.getByLabelText("Rename Groceries");
    await userEvent.type(input, "x{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("shows a validation error for an empty name", async () => {
    const onRename = vi.fn();
    render(<SubCategoryRow sub={sub} onRename={onRename} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByLabelText("Rename Groceries"));
    const input = screen.getByLabelText("Rename Groceries");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
  });
});
