import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthSwitcher } from "./MonthSwitcher";
import { currentMonthKey } from "../monthUtils";

describe("MonthSwitcher", () => {
  it("shows the month label and steps back on Previous month", async () => {
    const onChange = vi.fn();
    render(<MonthSwitcher monthKey="2026-05" onChange={onChange} />);

    expect(screen.getByText("May 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onChange).toHaveBeenCalledWith("2026-04");
  });

  it("steps forward on Next month when not viewing the current month", async () => {
    const onChange = vi.fn();
    render(<MonthSwitcher monthKey="2026-05" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onChange).toHaveBeenCalledWith("2026-06");
  });

  it("disables Next month when viewing the current month", () => {
    render(<MonthSwitcher monthKey={currentMonthKey()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });
});
