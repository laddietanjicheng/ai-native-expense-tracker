"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { categoryNameSchema } from "../schemas";
import { ApiError } from "@/lib/apiClient";

interface InlineNameFormProps {
  /** Current name when renaming, or "" when adding. Submitting the same value is a no-op close. */
  initialValue?: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
  submitLabel: string;
  ariaLabel: string;
  placeholder?: string;
  /** Small right-aligned text, e.g. "5 expenses" or "3 of 50 used". */
  trailingText?: string;
  className?: string;
}

/**
 * One inline row: a text input plus Save/Cancel, used for adding and
 * renaming categories and sub-categories. Enter saves, Escape cancels.
 */
export function InlineNameForm({
  initialValue = "",
  onSubmit,
  onClose,
  submitLabel,
  ariaLabel,
  placeholder,
  trailingText,
  className = "",
}: InlineNameFormProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const parsed = categoryNameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    if (parsed.data === initialValue) {
      onClose();
      return;
    }
    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Input
        autoFocus
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        maxLength={50}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onClose();
        }}
        className="w-72"
      />
      <Button onClick={commit} className="h-9 px-3.5 text-sm">
        {submitLabel}
      </Button>
      <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600">
        Cancel
      </button>
      {trailingText && <span className="ml-auto shrink-0 pr-2 text-[13px] text-slate-500">{trailingText}</span>}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
