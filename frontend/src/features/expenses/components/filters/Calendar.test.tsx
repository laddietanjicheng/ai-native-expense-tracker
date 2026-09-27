import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "./Calendar";

describe("Calendar", () => {
  it("shows the month label and weekday headers", () => {
    render(
      <Calendar
        year={2026}
        month={9}
        todayISO="2026-09-26"
        selectedFrom={null}
        selectedTo={null}
        onSelectDay={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    );
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
  });

  it("labels each day button with its full weekday date", () => {
    render(
      <Calendar
        year={2026}
        month={9}
        todayISO="2026-09-26"
        selectedFrom={null}
        selectedTo={null}
        onSelectDay={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Saturday, 26 September 2026")).toBeInTheDocument();
  });

  it("marks the selected range's edges as pressed", () => {
    render(
      <Calendar
        year={2026}
        month={9}
        todayISO="2026-09-26"
        selectedFrom="2026-09-08"
        selectedTo="2026-09-21"
        onSelectDay={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Tuesday, 8 September 2026")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Monday, 21 September 2026")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Wednesday, 9 September 2026")).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelectDay with the clicked day's ISO date", async () => {
    const onSelectDay = vi.fn();
    render(
      <Calendar
        year={2026}
        month={9}
        todayISO="2026-09-26"
        selectedFrom={null}
        selectedTo={null}
        onSelectDay={onSelectDay}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    );
    await userEvent.click(screen.getByLabelText("Saturday, 26 September 2026"));
    expect(onSelectDay).toHaveBeenCalledWith("2026-09-26");
  });

  it("calls onPrevMonth/onNextMonth from the header buttons", async () => {
    const onPrevMonth = vi.fn();
    const onNextMonth = vi.fn();
    render(
      <Calendar
        year={2026}
        month={9}
        todayISO="2026-09-26"
        selectedFrom={null}
        selectedTo={null}
        onSelectDay={vi.fn()}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />
    );
    await userEvent.click(screen.getByLabelText("Previous month"));
    await userEvent.click(screen.getByLabelText("Next month"));
    expect(onPrevMonth).toHaveBeenCalled();
    expect(onNextMonth).toHaveBeenCalled();
  });
});
