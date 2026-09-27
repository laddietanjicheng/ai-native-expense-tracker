"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MessageSquare, Maximize2, Minimize2, Minus, PlusCircle } from "lucide-react";
import { PlanCard } from "@/features/budgets/components/PlanCard";
import { useChat } from "../ChatContext";
import { useIsWideViewport } from "../useIsWideViewport";
import { ChatMessageText } from "./ChatMessageText";
import { WelcomeCard } from "./WelcomeCard";
import { Composer } from "./Composer";

const SCROLL_BOTTOM_THRESHOLD_PX = 24;

export function ChatPanel() {
  const {
    mode,
    setMode,
    messages,
    isStreaming,
    statusText,
    announcement,
    sendMessage,
    newConversation,
    prefillRequest,
    focusSignal,
  } = useChat();
  const isWideViewport = useIsWideViewport();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const node = bodyRef.current;
    if (node && stickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, statusText]);

  if (mode === "minimised") return null;

  function handleScroll() {
    const node = bodyRef.current;
    if (!node) return;
    stickToBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
  }

  const widthClass = mode === "expanded" ? "w-[640px]" : "w-[400px]";
  const lastMessage = messages[messages.length - 1];
  const isWaitingForFirstContent =
    isStreaming && lastMessage?.role === "assistant" && lastMessage.segments.length === 0 && !statusText;
  const positionClass = isWideViewport
    ? "sticky top-0 h-screen"
    : "fixed inset-y-0 right-0 z-40 h-full max-w-full shadow-[-12px_0_32px_rgba(15,23,42,0.16)]";

  return (
    <aside
      aria-label="Spending assistant"
      className={`flex flex-shrink-0 flex-col border-l border-slate-200 bg-white transition-[width] duration-200 ${positionClass} ${widthClass}`}
    >
      <div className="flex items-center gap-2.5 border-b border-slate-200 py-3.5 pl-5 pr-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-primary-50 text-primary-700">
          <MessageSquare size={18} aria-hidden="true" />
        </span>
        <div className="flex flex-grow flex-col">
          <b className="text-[16px] font-extrabold">Ask about your spending</b>
          <span className="text-xs text-slate-500">Answers from your own numbers</span>
        </div>
        <HeaderIconButton label="New conversation" onClick={newConversation}>
          <PlusCircle size={18} aria-hidden="true" />
        </HeaderIconButton>
        <HeaderIconButton
          label={mode === "expanded" ? "Collapse panel" : "Expand panel"}
          onClick={() => setMode(mode === "expanded" ? "docked" : "expanded")}
        >
          {mode === "expanded" ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </HeaderIconButton>
        <HeaderIconButton label="Minimise panel" onClick={() => setMode("minimised")}>
          <Minus size={18} aria-hidden="true" />
        </HeaderIconButton>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div ref={bodyRef} onScroll={handleScroll} className="flex flex-grow flex-col gap-4 overflow-y-auto p-5">
        {messages.length === 0 && <WelcomeCard onPick={sendMessage} />}
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} role={message.role}>
            {message.role === "user" && <p className="whitespace-pre-wrap">{message.content}</p>}
            {message.segments.map((segment, index) =>
              segment.kind === "text" ? (
                <ChatMessageText key={index} text={segment.text} />
              ) : (
                <div key={segment.key} className="mt-1">
                  <PlanCard proposal={segment.proposal} />
                </div>
              )
            )}
            {message.errorText && <p className="text-danger">{message.errorText}</p>}
          </ChatMessageBubble>
        ))}
        {isWaitingForFirstContent && <TypingIndicator />}
        {statusText && <p className="text-xs italic text-slate-500">{statusText}</p>}
      </div>

      <div className="border-t border-slate-200 px-4 pb-3.5 pt-3">
        <Composer disabled={isStreaming} onSend={sendMessage} prefillRequest={prefillRequest} focusSignal={focusSignal} />
        <p className="mx-0.5 mt-2 text-[11.5px] text-slate-500">
          Uses your totals and amounts, never your notes. Cleared when you close the tab. Not financial advice.
        </p>
      </div>
    </aside>
  );
}

function ChatMessageBubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  if (role === "user") {
    return (
      <div className="max-w-[92%] self-end rounded-2xl rounded-br-[4px] bg-primary px-3.5 py-2.5 text-sm leading-snug text-white">
        {children}
      </div>
    );
  }
  return <div className="max-w-[92%] self-start text-sm leading-snug text-slate-700">{children}</div>;
}

function TypingIndicator() {
  return (
    <span className="inline-flex gap-1 py-2.5" aria-label="Thinking">
      <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
      <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:0.2s]" />
      <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:0.4s]" />
    </span>
  );
}

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
