import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPanel } from "./ChatPanel";
import type { ChatMessage } from "../types";

const useChat = vi.fn();
const useIsWideViewport = vi.fn();

vi.mock("../ChatContext", () => ({
  useChat: () => useChat(),
}));

vi.mock("../useIsWideViewport", () => ({
  useIsWideViewport: () => useIsWideViewport(),
}));

function baseState(overrides: Partial<ReturnType<typeof useChat>> = {}) {
  return {
    mode: "docked",
    setMode: vi.fn(),
    messages: [] as ChatMessage[],
    isStreaming: false,
    statusText: null,
    announcement: "",
    sendMessage: vi.fn(),
    newConversation: vi.fn(),
    prefillRequest: null,
    focusSignal: 0,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ReturnType<typeof useChat>> = {}, isWideViewport = true) {
  useChat.mockReturnValue(baseState(overrides));
  useIsWideViewport.mockReturnValue(isWideViewport);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPanel />
    </QueryClientProvider>
  );
}

describe("ChatPanel", () => {
  beforeEach(() => {
    useChat.mockReset();
    useIsWideViewport.mockReset();
  });

  it("renders nothing when minimised", () => {
    const { container } = renderPanel({ mode: "minimised" });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the welcome card with example questions when there are no messages", () => {
    renderPanel();
    expect(screen.getByText("Ask anything about your spending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What are my repeat charges?" })).toBeInTheDocument();
  });

  it("sends an example question when clicked", async () => {
    const sendMessage = vi.fn();
    renderPanel({ sendMessage });
    await userEvent.click(screen.getByRole("button", { name: "What are my repeat charges?" }));
    expect(sendMessage).toHaveBeenCalledWith("What are my repeat charges?");
  });

  it("shows a status line while a tool is running", () => {
    renderPanel({ statusText: "Looking at September..." });
    expect(screen.getByText("Looking at September...")).toBeInTheDocument();
  });

  it("shows the typing indicator only while streaming with no content yet", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hi", segments: [] },
      { id: "a1", role: "assistant", content: "", segments: [] },
    ];
    renderPanel({ messages, isStreaming: true });
    expect(screen.getByLabelText("Thinking")).toBeInTheDocument();
  });

  it("renders streamed assistant text", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hi", segments: [] },
      { id: "a1", role: "assistant", content: "You're on track.", segments: [{ kind: "text", text: "You're on track." }] },
    ];
    renderPanel({ messages });
    expect(screen.getByText("You're on track.")).toBeInTheDocument();
  });

  it("shows the user's own question in their bubble", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Where can I save S$100?", segments: [] },
    ];
    renderPanel({ messages });
    expect(screen.getByText("Where can I save S$100?")).toBeInTheDocument();
  });

  it("renders a PlanCard for a proposal segment", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        segments: [
          {
            kind: "proposal",
            key: "p1",
            proposal: { title: "Budget plan", rows: [{ category_id: null, name: "Overall", from_cents: 150000, to_cents: 100000, reason: null }], footer: "Adds up" },
          },
        ],
      },
    ];
    renderPanel({ messages });
    expect(screen.getByText("Budget plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("shows an error message on the assistant message", () => {
    const messages: ChatMessage[] = [
      { id: "a1", role: "assistant", content: "", segments: [], errorText: "You've reached today's chat limit." },
    ];
    renderPanel({ messages });
    expect(screen.getByText("You've reached today's chat limit.")).toBeInTheDocument();
  });

  it("calls newConversation from the header button", async () => {
    const newConversation = vi.fn();
    renderPanel({ newConversation });
    await userEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(newConversation).toHaveBeenCalled();
  });

  it("toggles expand/collapse via the header button", async () => {
    const setMode = vi.fn();
    renderPanel({ setMode, mode: "docked" });
    await userEvent.click(screen.getByRole("button", { name: "Expand panel" }));
    expect(setMode).toHaveBeenCalledWith("expanded");
  });

  it("minimises via the header button", async () => {
    const setMode = vi.fn();
    renderPanel({ setMode });
    await userEvent.click(screen.getByRole("button", { name: "Minimise panel" }));
    expect(setMode).toHaveBeenCalledWith("minimised");
  });

  it("shows the footer disclaimer", () => {
    renderPanel();
    expect(
      screen.getByText("Uses your totals and amounts, never your notes. Cleared when you close the tab. Not financial advice.")
    ).toBeInTheDocument();
  });

  it("does not put aria-live on the whole scrolling log", () => {
    const { container } = renderPanel();
    const log = container.querySelector(".overflow-y-auto");
    expect(log).not.toHaveAttribute("aria-live");
  });

  it("renders the announcement in a single visually-hidden polite status region", () => {
    renderPanel({ announcement: "You're on track." });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("You're on track.");
    expect(status).toHaveClass("sr-only");
  });

  it("reserves layout space (sticky, no overlay classes) at wide viewports", () => {
    const { container } = renderPanel({}, true);
    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("sticky");
    expect(aside).not.toHaveClass("fixed");
  });

  it("renders as a fixed overlay drawer below the wide-viewport breakpoint", () => {
    const { container } = renderPanel({}, false);
    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("fixed");
    expect(aside).not.toHaveClass("sticky");
  });
});
