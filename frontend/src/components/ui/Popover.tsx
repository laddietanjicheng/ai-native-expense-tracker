"use client";

import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])';
const GAP = 8;

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  children: ReactNode;
  widthClassName?: string;
}

/**
 * Anchored popover: positioned under its trigger, closes on Escape or an
 * outside click, traps Tab within itself, and returns focus to whatever was
 * focused before it opened (normally the trigger button).
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  children,
  widthClassName = "w-80",
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  // Callers usually pass an inline onClose; keep the latest in a ref so the open/close
  // effect below doesn't re-run (and steal focus) on every parent re-render.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  // Starts at (0, 0) rather than null so the dialog mounts on the very first
  // render: the click-outside/focus effect below needs popoverRef to already
  // point at a real node, and this is corrected before paint by the layout
  // effect anyway.
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = popoverRef.current?.offsetWidth ?? 0;
      const maxLeft = window.innerWidth - width - GAP;
      const top = rect.bottom + GAP;
      setPosition({
        top,
        left: Math.max(GAP, Math.min(rect.left, maxLeft)),
        maxHeight: window.innerHeight - top - GAP,
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = popoverRef.current;
    const firstFocusable = node?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? node)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (node?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      previouslyFocused?.focus();
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight || undefined,
      }}
      className={`z-50 flex flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg outline-none ${widthClassName}`}
    >
      {children}
    </div>,
    document.body,
  );
}
