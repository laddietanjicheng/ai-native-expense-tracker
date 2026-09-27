import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChatTurn } from "./api";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

/** Wraps a stream's reader so releaseLock/cancel calls can be asserted on. */
function spyOnReader(stream: ReadableStream<Uint8Array>) {
  const cancel = vi.fn();
  const releaseLock = vi.fn();
  const realGetReader = stream.getReader.bind(stream);
  vi.spyOn(stream, "getReader").mockImplementation(() => {
    const reader = realGetReader();
    const originalCancel = reader.cancel.bind(reader);
    const originalReleaseLock = reader.releaseLock.bind(reader);
    reader.cancel = (...args: Parameters<typeof originalCancel>) => {
      cancel(...args);
      return originalCancel(...args);
    };
    reader.releaseLock = () => {
      releaseLock();
      return originalReleaseLock();
    };
    return reader;
  });
  return { cancel, releaseLock };
}

function makeHandlers() {
  return {
    onStatus: vi.fn(),
    onText: vi.fn(),
    onProposal: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

describe("streamChatTurn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches status, text and done frames split arbitrarily across chunks", async () => {
    const full =
      'event: status\ndata: {"text":"Looking at September..."}\n\n' +
      'event: text\ndata: {"text":"Hello"}\n\n' +
      'event: text\ndata: {"text":" world"}\n\n' +
      "event: done\ndata: {}\n\n";
    // Split mid-frame, and put two frames' worth in a single chunk.
    const chunks = [full.slice(0, 20), full.slice(20, 60), full.slice(60)];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(streamFromChunks(chunks), { status: 200 }))
    );

    const handlers = makeHandlers();
    await streamChatTurn([{ role: "user", content: "hi" }], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith("Looking at September...");
    expect(handlers.onText).toHaveBeenCalledWith("Hello");
    expect(handlers.onText).toHaveBeenCalledWith(" world");
    expect(handlers.onDone).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("dispatches a proposal frame", async () => {
    const proposal = { title: "Plan", rows: [], footer: "note" };
    const body = `event: proposal\ndata: ${JSON.stringify(proposal)}\n\nevent: done\ndata: {}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(streamFromChunks([body]), { status: 200 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onProposal).toHaveBeenCalledWith(proposal);
  });

  it("dispatches an error event from the stream", async () => {
    const body = 'event: error\ndata: {"message":"Something broke"}\n\n';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(streamFromChunks([body]), { status: 200 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("Something broke");
  });

  it("maps a RATE_LIMITED JSON error envelope to a friendly message", async () => {
    const envelope = { success: false, data: null, error: { code: "RATE_LIMITED", message: "Daily limit" }, meta: null };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 429 }))
    );

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("You've reached today's chat limit.");
  });

  it("surfaces a validation error envelope's message", async () => {
    const envelope = { success: false, data: null, error: { code: "VALIDATION_ERROR", message: "Message too long" }, meta: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 422 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("Message too long");
  });

  it("reports a network error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("Could not reach the server. Check your connection and try again.");
  });

  it("releases the reader lock once the stream finishes normally", async () => {
    const stream = streamFromChunks(["event: done\ndata: {}\n\n"]);
    const { releaseLock } = spyOnReader(stream);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, makeHandlers());

    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("cancels and releases the reader when the read loop is aborted mid-stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new DOMException("Aborted", "AbortError"));
      },
    });
    const { cancel, releaseLock } = spyOnReader(stream);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("reports a generic error when the response has no body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("reports a connection-lost error when the stream errors mid-read", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("boom");
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).toHaveBeenCalledWith("Connection lost. Try again.");
  });

  it("silently stops without calling onError when aborted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));

    const handlers = makeHandlers();
    await streamChatTurn([], { path: "/", month: "2026-09" }, new AbortController().signal, handlers);

    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
