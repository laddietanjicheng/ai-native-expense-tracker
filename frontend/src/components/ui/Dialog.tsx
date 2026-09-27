"use client";

import { ReactNode, useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  widthClassName?: string;
}

/**
 * Accessible modal built on the native <dialog> element: showModal() gives us
 * a focus trap and top-layer stacking for free, the "cancel" event fires on
 * Escape, and clicking the ::backdrop closes it.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  role = "dialog",
  widthClassName = "max-w-[520px]",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    function handleCancel(event: Event) {
      event.preventDefault();
      onClose();
    }

    function handleClick(event: MouseEvent) {
      if (event.target === node) onClose();
    }

    node.addEventListener("cancel", handleCancel);
    node.addEventListener("click", handleClick);
    return () => {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      role={role}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${widthClassName} rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40`}
    >
      {open ? children : null}
    </dialog>
  );
}
