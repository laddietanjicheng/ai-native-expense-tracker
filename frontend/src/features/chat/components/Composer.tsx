"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { MAX_MESSAGE_CHARS } from "../types";
import type { PrefillRequest } from "../ChatContext";

const MAX_HEIGHT_PX = 120;

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
  prefillRequest: PrefillRequest | null;
  focusSignal: number;
}

function resizeTextarea(node: HTMLTextAreaElement) {
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
}

export function Composer({ disabled, onSend, prefillRequest, focusSignal }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isFirstFocusSignal = useRef(true);
  const lastPrefillId = useRef<number | null>(null);

  const pendingCursorRef = useRef<number | null>(null);

  // Runs after `value` (and so the textarea's DOM value) has actually updated, so the
  // selection lands correctly instead of being reset to the end by the value change itself.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    resizeTextarea(node);
    if (pendingCursorRef.current !== null) {
      const cursor = pendingCursorRef.current;
      pendingCursorRef.current = null;
      node.focus();
      node.setSelectionRange(cursor, cursor);
    }
  }, [value]);

  useEffect(() => {
    if (!prefillRequest || prefillRequest.requestId === lastPrefillId.current) return;
    lastPrefillId.current = prefillRequest.requestId;
    pendingCursorRef.current = prefillRequest.cursorIndex;
    setValue(prefillRequest.text);
  }, [prefillRequest]);

  useEffect(() => {
    if (isFirstFocusSignal.current) {
      isFirstFocusSignal.current = false;
      return;
    }
    textareaRef.current?.focus();
  }, [focusSignal]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form
      className="flex items-end gap-2 rounded-xl border border-slate-300 py-1.5 pl-3.5 pr-1.5 focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(219,234,254,1)]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-composer-input" className="sr-only">
        Ask a question
      </label>
      <textarea
        id="chat-composer-input"
        ref={textareaRef}
        rows={1}
        value={value}
        maxLength={MAX_MESSAGE_CHARS}
        disabled={disabled}
        placeholder="e.g. Where can I save S$100 next month?"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="min-h-9 flex-grow resize-none border-0 bg-transparent py-2 text-sm leading-snug outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={disabled || value.trim() === ""}
        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-40"
      >
        <ArrowUp size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
