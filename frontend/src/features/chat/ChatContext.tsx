"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { currentMonthKey } from "@/features/insights/monthUtils";
import { streamChatTurn, type ChatApiMessage } from "./api";
import { MAX_HISTORY_MESSAGES, type ChatMessage, type ChatMode, type MessageSegment } from "./types";
import { WIDE_VIEWPORT_QUERY } from "./useIsWideViewport";

const MODE_STORAGE_KEY = "chat-mode";
const modeListeners = new Set<() => void>();

function readStoredMode(): ChatMode | null {
  try {
    const value = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (value === "docked" || value === "expanded" || value === "minimised") return value;
  } catch {
    // localStorage unavailable (private mode, disabled storage).
  }
  return null;
}

/** Client snapshot for useSyncExternalStore — only ever read once hydration has settled. */
export function getClientModeSnapshot(): ChatMode {
  return readStoredMode() ?? "docked";
}

/** Server (and pre-hydration client) snapshot, so the first paint always matches the SSR HTML. */
export function getServerModeSnapshot(): ChatMode {
  return "docked";
}

function subscribeToMode(onChange: () => void): () => void {
  modeListeners.add(onChange);
  return () => modeListeners.delete(onChange);
}

function storeMode(mode: ChatMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore — persistence is a convenience, not a requirement.
  }
  modeListeners.forEach((listener) => listener());
}

function nextId(): string {
  return Math.random().toString(36).slice(2);
}

export interface PrefillRequest {
  text: string;
  cursorIndex: number;
  requestId: number;
}

interface ChatContextValue {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  statusText: string | null;
  sendMessage: (text: string) => void;
  newConversation: () => void;
  openWithPrefill: (text: string, cursorIndex: number) => void;
  prefillRequest: PrefillRequest | null;
  focusSignal: number;
  setActiveMonth: (month: string | null) => void;
  announcement: string;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Builds the history sent to the API from complete (user, assistant) turns. A turn whose
 * assistant reply never produced any text (errored or aborted before streaming text) is
 * dropped entirely — its user question too, so roles keep alternating and the backend's
 * min_length=1 on every message is never violated by resending an empty reply.
 */
function toApiHistory(messages: ChatMessage[]): ChatApiMessage[] {
  const completeTurns: ChatMessage[] = [];
  const pairedLength = messages.length - (messages.length % 2);
  for (let i = 0; i < pairedLength; i += 2) {
    const [user, assistant] = [messages[i], messages[i + 1]];
    if (assistant.content.trim() === "") continue;
    completeTurns.push(user, assistant);
  }
  // A trailing, unpaired message is the current turn's question — always keep it.
  if (messages.length % 2 === 1) {
    completeTurns.push(messages[messages.length - 1]);
  }
  return completeTurns.slice(-MAX_HISTORY_MESSAGES).map((message) => ({ role: message.role, content: message.content }));
}

function appendTextSegment(segments: MessageSegment[], text: string): MessageSegment[] {
  const last = segments[segments.length - 1];
  if (last && last.kind === "text") {
    return [...segments.slice(0, -1), { kind: "text", text: last.text + text }];
  }
  return [...segments, { kind: "text", text }];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = useSyncExternalStore(subscribeToMode, getClientModeSnapshot, getServerModeSnapshot);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [prefillRequest, setPrefillRequest] = useState<PrefillRequest | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const activeMonthRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousModeRef = useRef<ChatMode>(mode);
  const requestCounterRef = useRef(0);
  // Mirrors `messages` synchronously: React doesn't guarantee a functional setState's
  // updater has run by the next line, so anything read in the same tick (building the
  // history to send) must come from this ref, not from re-deriving inside setMessages.
  const messagesRef = useRef<ChatMessage[]>([]);

  function applyMessages(next: ChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  const setMode = useCallback((next: ChatMode) => {
    storeMode(next);
  }, []);

  // First visit (nothing stored yet) on a narrow viewport starts minimised instead of docked.
  useEffect(() => {
    if (readStoredMode() !== null) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia(WIDE_VIEWPORT_QUERY).matches) {
      storeMode("minimised");
    }
  }, []);

  useEffect(() => {
    if (previousModeRef.current === "minimised" && mode !== "minimised") {
      setFocusSignal((value) => value + 1);
    }
    previousModeRef.current = mode;
  }, [mode]);

  const openWithPrefill = useCallback(
    (text: string, cursorIndex: number) => {
      requestCounterRef.current += 1;
      setMode("docked");
      setPrefillRequest({ text, cursorIndex, requestId: requestCounterRef.current });
      setFocusSignal((value) => value + 1);
    },
    [setMode]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessage = { id: nextId(), role: "user", content: trimmed, segments: [] };
      const assistantId = nextId();
      const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", segments: [] };

      const nextMessages = [...messagesRef.current, userMessage, assistantMessage];
      const historyForRequest = toApiHistory(nextMessages.filter((message) => message.id !== assistantId));
      applyMessages(nextMessages);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);
      setStatusText(null);
      setAnnouncement("Assistant is responding…");
      let finalText = "";

      const context = { path: pathname ?? "/", month: activeMonthRef.current ?? currentMonthKey() };

      function updateAssistant(updater: (message: ChatMessage) => ChatMessage) {
        applyMessages(messagesRef.current.map((message) => (message.id === assistantId ? updater(message) : message)));
      }

      streamChatTurn(historyForRequest, context, controller.signal, {
        onStatus: (statusMessage) => setStatusText(statusMessage),
        onText: (delta) => {
          setStatusText(null);
          finalText += delta;
          updateAssistant((message) => ({
            ...message,
            segments: appendTextSegment(message.segments, delta),
            content: message.content + delta,
          }));
        },
        onProposal: (proposal) => {
          setStatusText(null);
          updateAssistant((message) => ({
            ...message,
            segments: [...message.segments, { kind: "proposal", proposal, key: nextId() }],
          }));
        },
        onDone: () => {
          setIsStreaming(false);
          setStatusText(null);
          setAnnouncement(finalText.trim() !== "" ? finalText : "Response ready.");
        },
        onError: (message) => {
          setIsStreaming(false);
          setStatusText(null);
          setAnnouncement(message);
          updateAssistant((current) => ({ ...current, errorText: message }));
        },
      }).finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      });
    },
    [isStreaming, pathname]
  );

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const setActiveMonth = useCallback((month: string | null) => {
    activeMonthRef.current = month;
  }, []);

  const newConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setStatusText(null);
    setAnnouncement("");
    applyMessages([]);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      mode,
      setMode,
      messages,
      isStreaming,
      statusText,
      announcement,
      sendMessage,
      newConversation,
      openWithPrefill,
      prefillRequest,
      focusSignal,
      setActiveMonth,
    }),
    [
      mode,
      setMode,
      messages,
      isStreaming,
      statusText,
      announcement,
      sendMessage,
      newConversation,
      openWithPrefill,
      prefillRequest,
      focusSignal,
      setActiveMonth,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within a ChatProvider");
  return context;
}

/** Lets a page (e.g. Insights) tell the chat panel which month it's currently showing. */
export function useChatActiveMonth(month: string): void {
  const { setActiveMonth } = useChat();
  useEffect(() => {
    setActiveMonth(month);
    return () => setActiveMonth(null);
  }, [month, setActiveMonth]);
}
