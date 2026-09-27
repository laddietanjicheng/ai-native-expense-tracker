"use client";

import { MessageSquare } from "lucide-react";
import { useChat } from "../ChatContext";

export function ChatLauncher() {
  const { mode, setMode } = useChat();
  if (mode !== "minimised") return null;

  return (
    <button
      type="button"
      onClick={() => setMode("docked")}
      className="fixed bottom-6 right-6 z-40 inline-flex h-[52px] items-center gap-2.5 rounded-full bg-slate-900 pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.25)]"
    >
      <MessageSquare size={20} aria-hidden="true" />
      Ask about your spending
    </button>
  );
}
