import { API_URL } from "@/lib/apiClient";
import { splitSseBuffer, parseSseFrame, type SseFrame } from "./sse";
import type { Proposal } from "./types";

export interface ChatApiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatApiContext {
  path: string;
  month: string;
}

export interface ChatStreamHandlers {
  onStatus: (text: string) => void;
  onText: (text: string) => void;
  onProposal: (proposal: Proposal) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";
const RATE_LIMIT_ERROR = "You've reached today's chat limit.";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    if (payload.error?.code === "RATE_LIMITED") return RATE_LIMIT_ERROR;
    return payload.error?.message ?? GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

function dispatchFrame(frame: SseFrame, handlers: ChatStreamHandlers): void {
  switch (frame.event) {
    case "status":
      handlers.onStatus((frame.data as { text: string }).text);
      return;
    case "text":
      handlers.onText((frame.data as { text: string }).text);
      return;
    case "proposal":
      handlers.onProposal(frame.data as Proposal);
      return;
    case "error":
      handlers.onError((frame.data as { message: string }).message);
      return;
    case "done":
      handlers.onDone();
      return;
    default:
      return;
  }
}

/** Streams one chat turn over POST (SSE frames), dispatching to `handlers` as they arrive. */
export async function streamChatTurn(
  messages: ChatApiMessage[],
  context: ChatApiContext,
  signal: AbortSignal,
  handlers: ChatStreamHandlers
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, context }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return;
    handlers.onError(NETWORK_ERROR);
    return;
  }

  if (!response.ok) {
    handlers.onError(await extractErrorMessage(response));
    return;
  }
  if (!response.body) {
    handlers.onError(GENERIC_ERROR);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitSseBuffer(buffer);
      buffer = rest;
      for (const frameText of frames) {
        const frame = parseSseFrame(frameText);
        if (frame) dispatchFrame(frame, handlers);
      }
    }
    const finalFrame = parseSseFrame(buffer);
    if (finalFrame) dispatchFrame(finalFrame, handlers);
  } catch (error) {
    if (isAbortError(error)) {
      await reader.cancel().catch(() => {});
      return;
    }
    handlers.onError("Connection lost. Try again.");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released (e.g. by cancel()) — nothing to do.
    }
  }
}
