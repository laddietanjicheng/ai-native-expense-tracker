import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortFilter } from "./SortFilter";

function renderFilter(props: Partial<React.ComponentProps<typeof SortFilter>> = {}) {
  const onOpenChange = vi.fn();
  const onApply = vi.fn();
  const utils = render(
    <SortFilter sort="date" order="desc" open={false} onOpenChange={onOpenChange} onApply={onApply} {...props} />
  );
  return { ...utils, onOpenChange, onApply };
}

describe("SortFilter", () => {
  it("shows the current sort label on the trigger", () => {
    renderFilter();
    expect(screen.getByText("Newest first")).toBeInTheDocument();
  });

  it("lists all four sort options with the current one checked", () => {
    renderFilter({ open: true, sort: "amount", order: "asc" });
    const selected = screen.getByRole("option", { name: "Lowest amount" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("applies the chosen sort/order and closes", async () => {
    const { onApply, onOpenChange } = renderFilter({ open: true });
    await userEvent.click(screen.getByRole("option", { name: "Highest amount" }));
    expect(onApply).toHaveBeenCalledWith("amount", "desc");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves focus with ArrowDown/ArrowUp, wrapping around", async () => {
    renderFilter({ open: true });
    const options = screen.getAllByRole("option");
    options[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(options[3]).toHaveFocus();
  });
});
