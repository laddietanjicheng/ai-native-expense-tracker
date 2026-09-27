"use client";

import { ReactNode, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { ApiError } from "@/lib/apiClient";

interface ConfirmDialogProps {
  open: boolean;
  labelledBy: string;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  variant?: "danger" | "primary";
  /** Extra content rendered between the title and the message, e.g. a summary card. */
  children?: ReactNode;
}

/**
 * Reusable confirm/delete dialog: shows a pending state while `onConfirm`
 * runs and an inline error if it rejects, instead of leaving the rejection
 * unhandled.
 */
export function ConfirmDialog({
  open,
  labelledBy,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  variant = "danger",
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onClose();
    } catch (err) {
      setPending(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  const iconWrapperClass = variant === "danger" ? "bg-danger-50 text-danger" : "bg-primary-50 text-primary";

  return (
    <Dialog open={open} onClose={handleClose} labelledBy={labelledBy} widthClassName="max-w-[440px]" role="alertdialog">
      <div className="flex flex-col gap-4 p-7">
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${iconWrapperClass}`}>
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <h2 id={labelledBy} className="text-xl font-extrabold">
            {title}
          </h2>
        </div>
        {children}
        <p className="text-sm leading-relaxed text-slate-600">{message}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={handleConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
