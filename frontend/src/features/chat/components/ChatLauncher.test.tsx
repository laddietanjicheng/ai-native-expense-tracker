import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatLauncher } from "./ChatLauncher";

const useChat = vi.fn();

vi.mock("../ChatContext", () => ({
  useChat: () => useChat(),
}));

describe("ChatLauncher", () => {
  beforeEach(() => useChat.mockReset());

  it("renders nothing when not minimised", () => {
    useChat.mockReturnValue({ mode: "docked", setMode: vi.fn() });
    const { container } = render(<ChatLauncher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the launcher button when minimised and opens docked mode on click", async () => {
    const setMode = vi.fn();
    useChat.mockReturnValue({ mode: "minimised", setMode });
    render(<ChatLauncher />);

    const button = screen.getByRole("button", { name: "Ask about your spending" });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);

    expect(setMode).toHaveBeenCalledWith("docked");
  });
});
