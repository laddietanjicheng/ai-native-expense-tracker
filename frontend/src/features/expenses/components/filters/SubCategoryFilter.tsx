"use client";

import { useRef } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { FilterTriggerButton } from "@/components/ui/FilterTriggerButton";
import { Popover } from "@/components/ui/Popover";
import type { Category } from "@/features/categories/types";

interface SubCategoryFilterProps {
  subCategories: Category[];
  appliedId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (id: string | null) => void;
}

/** Single-select sub-category filter; only shown when exactly one category is applied. */
export function SubCategoryFilter({ subCategories, appliedId, open, onOpenChange, onApply }: SubCategoryFilterProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = subCategories.find((sub) => sub.id === appliedId);

  function choose(id: string | null) {
    onApply(id);
    onOpenChange(false);
  }

  return (
    <>
      <FilterTriggerButton
        ref={triggerRef}
        active={Boolean(appliedId)}
        open={open}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Layers size={16} aria-hidden="true" />
        Sub-category
        <span className="font-medium text-slate-600">· {selected ? selected.name : "All"}</span>
        <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
      </FilterTriggerButton>

      <Popover
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        label="Filter by sub-category"
        widthClassName="w-72"
      >
        <div role="radiogroup" aria-label="Sub-categories" className="flex flex-col gap-0.5 p-3">
          <button
            type="button"
            role="radio"
            aria-checked={appliedId === null}
            onClick={() => choose(null)}
            className={`flex w-full h-10 items-center rounded-lg px-3 text-left text-sm font-bold ${
              appliedId === null ? "bg-primary-50 text-primary-700" : "text-slate-900 hover:bg-slate-50"
            }`}
          >
            All sub-categories
          </button>
          {subCategories.map((sub) => {
            const checked = sub.id === appliedId;
            return (
              <button
                key={sub.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(sub.id)}
                className={`flex w-full h-10 items-center justify-between rounded-lg px-3 text-left text-sm font-bold ${
                  checked ? "bg-primary-50 text-primary-700" : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span>{sub.name}</span>
                <span className="text-[13px] font-semibold text-slate-500">{sub.expense_count}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
