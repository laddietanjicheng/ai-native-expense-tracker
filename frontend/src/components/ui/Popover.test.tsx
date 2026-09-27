import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { Popover } from "./Popover";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={anchorRef} type="button">
        Trigger
      </button>
      <Popover open={open} onClose={onClose} anchorRef={anchorRef} label="Test popover">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Popover>
    </div>
  );
}

describe("Popover", () => {
  it("renders nothing when closed", () => {
    render(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders its content with the given label when open", () => {
    render(<Harness open onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Test popover" })).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on an outside click", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <span>Outside</span>
        <Harness open onClose={onClose} />
      </div>
    );
    await userEvent.click(screen.getByText("Outside"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the popover", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await userEvent.click(screen.getByText("First"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns focus to the previously focused element on close", async () => {
    const { rerender } = render(<Harness open={false} onClose={vi.fn()} />);
    const trigger = screen.getByText("Trigger");
    trigger.focus();
    rerender(<Harness open onClose={vi.fn()} />);
    rerender(<Harness open={false} onClose={vi.fn()} />);
    expect(trigger).toHaveFocus();
  });

  it("keeps focus where it is when the parent re-renders with a new onClose", async () => {
    const { rerender } = render(<Harness open onClose={() => {}} />);
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();

    rerender(<Harness open onClose={() => {}} />);

    expect(last).toHaveFocus();
  });

  it("uses the latest onClose after re-rendering", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Harness open onClose={first} />);
    rerender(<Harness open onClose={latest} />);

    await userEvent.keyboard("{Escape}");

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
