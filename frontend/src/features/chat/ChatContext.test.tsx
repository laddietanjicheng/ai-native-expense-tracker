import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { ChatProvider, useChat, useChatActiveMonth, getClientModeSnapshot, getServerModeSnapshot } from "./ChatContext";
import type { ChatStreamHandlers } from "./api";

const streamChatTurn = vi.fn();

vi.mock("./api", () => ({
  streamChatTurn: (...args: unknown[]) => streamChatTurn(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/insights",
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

function lastHandlers(): ChatStreamHandlers {
  return streamChatTurn.mock.calls[streamChatTurn.mock.calls.length - 1][3] as ChatStreamHandlers;
}

describe("ChatProvider", () => {
  beforeEach(() => {
    streamChatTurn.mockReset();
    streamChatTurn.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it("defaults to docked mode and persists mode changes to localStorage", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.mode).toBe("docked");

    act(() => result.current.setMode("expanded"));

    expect(result.current.mode).toBe("expanded");
    expect(window.localStorage.getItem("chat-mode")).toBe("expanded");
  });

  it("restores a previously stored mode on mount", () => {
    window.localStorage.setItem("chat-mode", "minimised");
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.mode).toBe("minimised");
  });

  it("falls back to docked when localStorage.getItem throws", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.mode).toBe("docked");
    spy.mockRestore();
  });

  it("does not throw when localStorage.setItem throws", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(() => act(() => result.current.setMode("expanded"))).not.toThrow();
    spy.mockRestore();
  });

  it("sends the trimmed message, appends a user and placeholder assistant message, and streams text back", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => result.current.sendMessage("  How am I doing?  "));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "How am I doing?" });
    expect(result.current.isStreaming).toBe(true);

    act(() => {
      lastHandlers().onStatus("Looking at September...");
    });
    expect(result.current.statusText).toBe("Looking at September...");

    act(() => {
      lastHandlers().onText("You're on track.");
    });
    expect(result.current.statusText).toBeNull();
    expect(result.current.messages[1].segments).toEqual([{ kind: "text", text: "You're on track." }]);

    act(() => lastHandlers().onDone());
    expect(result.current.isStreaming).toBe(false);
  });

  it("sends context.path and a month, falling back to the current month key", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("Hi"));

    const [, context] = streamChatTurn.mock.calls[0];
    expect(context.path).toBe("/insights");
    expect(context.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("renders a proposal segment in the assistant message", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("Plan my budget"));

    const proposal = { title: "Plan", rows: [], footer: "note" };
    act(() => lastHandlers().onProposal(proposal));

    expect(result.current.messages[1].segments[0]).toMatchObject({ kind: "proposal", proposal });
  });

  it("surfaces an error event on the assistant message and stops streaming", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("Hi"));

    act(() => lastHandlers().onError("You've reached today's chat limit."));

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].errorText).toBe("You've reached today's chat limit.");
  });

  it("sends only the last 20 messages as history", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    for (let i = 0; i < 12; i++) {
      act(() => result.current.sendMessage(`message ${i}`));
      act(() => lastHandlers().onText(`reply ${i}`));
      act(() => lastHandlers().onDone());
    }
    expect(result.current.messages).toHaveLength(24);

    const [history] = streamChatTurn.mock.calls[streamChatTurn.mock.calls.length - 1];
    expect(history).toHaveLength(20);
    expect(history[19]).toEqual({ role: "user", content: "message 11" });
  });

  it("drops a failed turn (empty assistant reply) from history entirely, keeping roles alternating", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => result.current.sendMessage("What happened to my budget?"));
    act(() => lastHandlers().onError("You've reached today's chat limit."));

    act(() => result.current.sendMessage("Try again"));

    const [history] = streamChatTurn.mock.calls[1];
    expect(history).toEqual([{ role: "user", content: "Try again" }]);
    expect(history.every((message: { content: string }) => message.content.trim() !== "")).toBe(true);
  });

  it("drops a turn that completed with no text at all (e.g. done fired before any text)", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => result.current.sendMessage("First question"));
    act(() => lastHandlers().onDone());
    act(() => result.current.sendMessage("Second question"));

    const [history] = streamChatTurn.mock.calls[1];
    expect(history).toEqual([{ role: "user", content: "Second question" }]);
  });

  it("aborts the in-flight stream and clears messages on newConversation", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("Hi"));
    const [, , signal] = streamChatTurn.mock.calls[0];

    act(() => result.current.newConversation());

    expect(signal.aborted).toBe(true);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it("ignores sendMessage while already streaming", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("First"));
    act(() => result.current.sendMessage("Second"));

    expect(streamChatTurn).toHaveBeenCalledTimes(1);
  });

  it("openWithPrefill switches to docked mode and sets a prefill request", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.setMode("minimised"));

    act(() => result.current.openWithPrefill("I want to spend at most S$ this month.", 27));

    expect(result.current.mode).toBe("docked");
    expect(result.current.prefillRequest).toMatchObject({ text: "I want to spend at most S$ this month.", cursorIndex: 27 });
  });

  it("starts a new text segment after a proposal instead of merging into it", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.sendMessage("Plan my budget"));

    act(() => lastHandlers().onProposal({ title: "Plan", rows: [], footer: "note" }));
    act(() => lastHandlers().onText("Anything else you want to protect?"));

    const segments = result.current.messages[1].segments;
    expect(segments).toHaveLength(2);
    expect(segments[1]).toEqual({ kind: "text", text: "Anything else you want to protect?" });
  });

  it("useChatActiveMonth sets and, once unmounted, clears the active month used for context.month", () => {
    const chatRef: { current: ReturnType<typeof useChat> | null } = { current: null };

    function Probe({ month }: { month: string }) {
      useChatActiveMonth(month);
      return null;
    }
    function Harness({ showProbe }: { showProbe: boolean }) {
      chatRef.current = useChat();
      return showProbe ? <Probe month="2026-07" /> : null;
    }

    const { rerender } = render(
      <ChatProvider>
        <Harness showProbe />
      </ChatProvider>
    );

    act(() => chatRef.current?.sendMessage("Hi"));
    expect(streamChatTurn.mock.calls[0][1].month).toBe("2026-07");
    act(() => lastHandlers().onDone());

    rerender(
      <ChatProvider>
        <Harness showProbe={false} />
      </ChatProvider>
    );
    act(() => chatRef.current?.sendMessage("Bye"));
    expect(streamChatTurn.mock.calls[1][1].month).not.toBe("2026-07");
  });

  it("bumps focusSignal when leaving minimised mode or opening with a prefill", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    const initial = result.current.focusSignal;
    act(() => result.current.setMode("minimised"));
    act(() => result.current.setMode("docked"));
    await waitFor(() => expect(result.current.focusSignal).toBeGreaterThan(initial));
  });

  describe("mode hydration snapshots", () => {
    it("the server snapshot is always docked, regardless of what's stored", () => {
      window.localStorage.setItem("chat-mode", "expanded");
      expect(getServerModeSnapshot()).toBe("docked");
    });

    it("the client snapshot reflects the stored mode", () => {
      window.localStorage.setItem("chat-mode", "expanded");
      expect(getClientModeSnapshot()).toBe("expanded");
      window.localStorage.clear();
      expect(getClientModeSnapshot()).toBe("docked");
    });
  });

  describe("announcement (visually-hidden status region)", () => {
    it("announces that the assistant is responding, then the final answer once on done", () => {
      const { result } = renderHook(() => useChat(), { wrapper });
      act(() => result.current.sendMessage("How am I doing?"));
      expect(result.current.announcement).toBe("Assistant is responding…");

      act(() => lastHandlers().onText("You're "));
      act(() => lastHandlers().onText("on track."));
      expect(result.current.announcement).toBe("Assistant is responding…");

      act(() => lastHandlers().onDone());
      expect(result.current.announcement).toBe("You're on track.");
    });

    it("announces the error message once on an error event", () => {
      const { result } = renderHook(() => useChat(), { wrapper });
      act(() => result.current.sendMessage("Hi"));
      act(() => lastHandlers().onError("You've reached today's chat limit."));
      expect(result.current.announcement).toBe("You've reached today's chat limit.");
    });

    it("falls back to a generic announcement when a turn completes with no text (e.g. proposal only)", () => {
      const { result } = renderHook(() => useChat(), { wrapper });
      act(() => result.current.sendMessage("Plan my budget"));
      act(() => lastHandlers().onProposal({ title: "Plan", rows: [], footer: "note" }));
      act(() => lastHandlers().onDone());
      expect(result.current.announcement).toBe("Response ready.");
    });
  });

  describe("first visit on a narrow viewport", () => {
    function mockMatchMedia(matches: boolean) {
      window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    }

    it("defaults to minimised when nothing is stored yet and the viewport is narrow", () => {
      mockMatchMedia(false);
      const { result } = renderHook(() => useChat(), { wrapper });
      expect(result.current.mode).toBe("minimised");
    });

    it("keeps the docked default when nothing is stored and the viewport is wide", () => {
      mockMatchMedia(true);
      const { result } = renderHook(() => useChat(), { wrapper });
      expect(result.current.mode).toBe("docked");
    });

    it("does not override a previously stored mode even on a narrow viewport", () => {
      mockMatchMedia(false);
      window.localStorage.setItem("chat-mode", "expanded");
      const { result } = renderHook(() => useChat(), { wrapper });
      expect(result.current.mode).toBe("expanded");
    });
  });
});
