import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders the title and message when open", () => {
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Delete this?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
  });

  it("renders extra children between the title and the message", () => {
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      >
        <p>Extra summary</p>
      </ConfirmDialog>
    );

    expect(screen.getByText("Extra summary")).toBeInTheDocument();
  });

  it("calls onConfirm and then onClose when confirmed successfully", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an inline error and does not close when onConfirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Boom"));
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the ApiError message when onConfirm rejects with one", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    const onConfirm = vi.fn().mockRejectedValue(new ApiError("CONFLICT", "Cannot delete right now", 409));
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Cannot delete right now")).toBeInTheDocument();
  });

  it("calls onClose without calling onConfirm when Cancel is clicked", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        labelledBy="confirm-title"
        title="Delete this?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
