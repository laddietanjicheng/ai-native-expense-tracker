import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineNameForm } from "./InlineNameForm";

describe("InlineNameForm", () => {
  it("renders the initial value, placeholder and trailing text", () => {
    render(
      <InlineNameForm
        initialValue="Food"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        submitLabel="Save"
        ariaLabel="Rename Food"
        trailingText="5 expenses"
      />
    );

    expect(screen.getByLabelText("Rename Food")).toHaveValue("Food");
    expect(screen.getByText("5 expenses")).toBeInTheDocument();
  });

  it("submits the trimmed value on Enter", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<InlineNameForm onSubmit={onSubmit} onClose={vi.fn()} submitLabel="Add" ariaLabel="New category name" />);

    await userEvent.type(screen.getByLabelText("New category name"), "  Travel  {Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Travel");
  });

  it("closes without submitting when the value is unchanged from initialValue", async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <InlineNameForm
        initialValue="Food"
        onSubmit={onSubmit}
        onClose={onClose}
        submitLabel="Save"
        ariaLabel="Rename Food"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a validation error and does not submit for an empty name", async () => {
    const onSubmit = vi.fn();
    render(<InlineNameForm onSubmit={onSubmit} onClose={vi.fn()} submitLabel="Add" ariaLabel="New category name" />);

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server error message and stays open when onSubmit rejects", async () => {
    const { ApiError } = await import("@/lib/apiClient");
    const onSubmit = vi.fn().mockRejectedValue(new ApiError("DUPLICATE_NAME", "Already exists", 409));
    const onClose = vi.fn();
    render(<InlineNameForm onSubmit={onSubmit} onClose={onClose} submitLabel="Add" ariaLabel="New category name" />);

    await userEvent.type(screen.getByLabelText("New category name"), "Food{Enter}");

    expect(await screen.findByText("Already exists")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels on Escape without submitting", async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<InlineNameForm onSubmit={onSubmit} onClose={onClose} submitLabel="Add" ariaLabel="New category name" />);

    await userEvent.type(screen.getByLabelText("New category name"), "x{Escape}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<InlineNameForm onSubmit={vi.fn()} onClose={onClose} submitLabel="Add" ariaLabel="New category name" />);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });
});
