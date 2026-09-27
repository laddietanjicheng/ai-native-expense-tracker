import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";
import { MAX_MESSAGE_CHARS } from "../types";

function getTextarea() {
  return screen.getByLabelText("Ask a question") as HTMLTextAreaElement;
}

describe("Composer", () => {
  it("sends on Enter and clears the input", async () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} prefillRequest={null} focusSignal={0} />);

    await userEvent.type(getTextarea(), "How am I doing?{Enter}");

    expect(onSend).toHaveBeenCalledWith("How am I doing?");
    expect(getTextarea().value).toBe("");
  });

  it("adds a newline instead of sending on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} prefillRequest={null} focusSignal={0} />);

    await userEvent.type(getTextarea(), "Line one{Shift>}{Enter}{/Shift}Line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(getTextarea().value).toBe("Line one\nLine two");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} prefillRequest={null} focusSignal={0} />);

    await userEvent.type(getTextarea(), "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the textarea and send button while streaming", () => {
    render(<Composer disabled onSend={vi.fn()} prefillRequest={null} focusSignal={0} />);

    expect(getTextarea()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("enforces the 2,000 character limit", () => {
    render(<Composer disabled={false} onSend={vi.fn()} prefillRequest={null} focusSignal={0} />);
    expect(getTextarea()).toHaveAttribute("maxlength", String(MAX_MESSAGE_CHARS));
  });

  it("applies a prefill request's text and places the cursor at the given index", () => {
    render(
      <Composer
        disabled={false}
        onSend={vi.fn()}
        prefillRequest={{ text: "I want to spend at most S$ this month. How should I split it?", cursorIndex: 27, requestId: 1 }}
        focusSignal={1}
      />
    );

    const textarea = getTextarea();
    expect(textarea.value).toBe("I want to spend at most S$ this month. How should I split it?");
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(27);
    expect(textarea.selectionEnd).toBe(27);
  });
});
