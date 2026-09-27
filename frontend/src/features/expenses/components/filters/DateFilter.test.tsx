import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateFilter } from "./DateFilter";

vi.mock("@/lib/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates")>();
  return { ...actual, todayISOInSingapore: () => "2026-09-26" };
});

function renderFilter(props: Partial<React.ComponentProps<typeof DateFilter>> = {}) {
  const onOpenChange = vi.fn();
  const onApplyPreset = vi.fn();
  const onApplyCustom = vi.fn();
  const utils = render(
    <DateFilter
      preset="this_month"
      customFrom={null}
      customTo={null}
      open={false}
      onOpenChange={onOpenChange}
      onApplyPreset={onApplyPreset}
      onApplyCustom={onApplyCustom}
      {...props}
    />
  );
  return { ...utils, onOpenChange, onApplyPreset, onApplyCustom };
}

describe("DateFilter trigger", () => {
  it("shows the preset label with no subtitle for this_month", () => {
    renderFilter();
    expect(screen.getByRole("button", { name: /This month/ })).toBeInTheDocument();
  });

  it("shows a short month-range subtitle for last_3_months", () => {
    renderFilter({ preset: "last_3_months" });
    expect(screen.getByText(/·/)).toBeInTheDocument();
  });

  it("shows a short day-range subtitle for a custom range", () => {
    renderFilter({ preset: "custom", customFrom: "2026-09-08", customTo: "2026-09-21" });
    expect(screen.getByText("· 8 – 21 Sep")).toBeInTheDocument();
  });

  it("calls onOpenChange when clicked", async () => {
    const { onOpenChange } = renderFilter();
    await userEvent.click(screen.getByRole("button", { name: /This month/ }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe("DateFilter popover", () => {
  it("applies a named preset immediately and closes", async () => {
    const { onApplyPreset, onOpenChange } = renderFilter({ open: true });
    await userEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(onApplyPreset).toHaveBeenCalledWith("last_7_days");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("builds a range from two calendar clicks and applies it", async () => {
    const { onApplyCustom, onOpenChange } = renderFilter({ open: true });

    await userEvent.click(screen.getByLabelText(/^\w+, 8 September 2026$/));
    await userEvent.click(screen.getByLabelText(/^\w+, 21 September 2026$/));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyCustom).toHaveBeenCalledWith("2026-09-08", "2026-09-21");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("starts a new range when clicking a day before the current start", async () => {
    renderFilter({ open: true });

    await userEvent.click(screen.getByLabelText(/^\w+, 21 September 2026$/));
    await userEvent.click(screen.getByLabelText(/^\w+, 8 September 2026$/));

    // After restarting, both edges should be the new (earlier) day until an end is picked.
    expect(screen.getByText("8 – 8 Sep 2026")).toBeInTheDocument();
  });

  it("disables Apply until both dates are picked", () => {
    renderFilter({ open: true });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("parses a typed start/end date on Enter and enables Apply", async () => {
    renderFilter({ open: true });

    await userEvent.type(screen.getByLabelText("Start date"), "05/09/2026{Enter}");
    await userEvent.type(screen.getByLabelText("End date"), "10/09/2026{Enter}");

    expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
    expect(screen.getByText("5 – 10 Sep 2026")).toBeInTheDocument();
  });

  it("reverts an invalid typed date instead of applying it", async () => {
    renderFilter({ open: true, customFrom: "2026-09-08", customTo: "2026-09-21" });

    const startInput = screen.getByLabelText("Start date");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "not-a-date");
    await userEvent.tab();

    expect(startInput).toHaveValue("08/09/2026");
  });

  it("calls onOpenChange(false) without applying on Cancel", async () => {
    const { onApplyCustom, onOpenChange } = renderFilter({ open: true });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApplyCustom).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("checks Custom range once a day is picked", async () => {
    renderFilter({ open: true });
    await userEvent.click(screen.getByLabelText(/^\w+, 8 September 2026$/));
    expect(screen.getByRole("radio", { name: /Custom range/ })).toHaveAttribute("aria-checked", "true");
  });
});
