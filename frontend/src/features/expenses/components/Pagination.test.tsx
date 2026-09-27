import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("shows the current range and page count", () => {
    render(<Pagination page={1} pageSize={10} totalCount={24} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 1–10 of 24")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(<Pagination page={1} pageSize={10} totalCount={24} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();

    rerender(<Pagination page={3} pageSize={10} totalCount={24} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("calls onPageChange with the next/previous page number", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={10} totalCount={24} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await userEvent.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("shows a no-expenses message when the count is zero", () => {
    render(<Pagination page={1} pageSize={10} totalCount={0} onPageChange={vi.fn()} />);
    expect(screen.getByText("No expenses")).toBeInTheDocument();
  });
});
