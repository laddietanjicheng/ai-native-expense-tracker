"use client";

import { KeyboardEvent, useRef } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import type { SortField, SortOrder } from "../../types";

interface SortOption {
  value: string;
  label: string;
  sort: SortField;
  order: SortOrder;
}

const SORT_OPTIONS: SortOption[] = [
  { value: "date_desc", label: "Newest first", sort: "date", order: "desc" },
  { value: "date_asc", label: "Oldest first", sort: "date", order: "asc" },
  { value: "amount_desc", label: "Highest amount", sort: "amount", order: "desc" },
  { value: "amount_asc", label: "Lowest amount", sort: "amount", order: "asc" },
];

interface SortFilterProps {
  sort: SortField;
  order: SortOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (sort: SortField, order: SortOrder) => void;
}

/** Moves focus between sibling [role="option"] buttons on ArrowUp/ArrowDown, wrapping around. */
function handleArrowKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (currentIndex + delta + items.length) % items.length;
  items[nextIndex]?.focus();
}

export function SortFilter({ sort, order, open, onOpenChange, onApply }: SortFilterProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = SORT_OPTIONS.find((option) => option.sort === sort && option.order === order) ?? SORT_OPTIONS[0];

  function choose(option: SortOption) {
    onApply(option.sort, option.order);
    onOpenChange(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        <ArrowUpDown size={16} className="text-slate-500" aria-hidden="true" />
        Sort: <strong className="font-extrabold text-slate-900">{current.label}</strong>
        <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
      </button>

      <Popover open={open} onClose={() => onOpenChange(false)} anchorRef={triggerRef} label="Sort by" widthClassName="w-56">
        <div role="listbox" aria-label="Sort by" onKeyDown={handleArrowKeys} className="flex flex-col gap-0.5 p-2">
          {SORT_OPTIONS.map((option) => {
            const checked = option.value === current.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => choose(option)}
                className={`flex w-full h-10 items-center justify-between rounded-lg px-3 text-left text-sm font-semibold ${
                  checked ? "bg-primary-50 text-primary-700" : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                {option.label}
                {checked && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
