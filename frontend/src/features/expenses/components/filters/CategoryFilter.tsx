"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Search, Tag } from "lucide-react";
import { FilterTriggerButton } from "@/components/ui/FilterTriggerButton";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import type { Category } from "@/features/categories/types";

interface CategoryFilterProps {
  categories: Category[];
  appliedIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (ids: string[]) => void;
}

/** Category filter trigger + popover: a local pending selection that only commits on Apply. */
export function CategoryFilter({ categories, appliedIds, open, onOpenChange, onApply }: CategoryFilterProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <FilterTriggerButton
        ref={triggerRef}
        active={appliedIds.length > 0}
        open={open}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Tag size={16} aria-hidden="true" />
        Category
        {appliedIds.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-extrabold text-white">
            {appliedIds.length}
          </span>
        )}
        <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
      </FilterTriggerButton>

      <Popover
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        label="Filter by category"
        widthClassName="w-80"
      >
        {open && (
          <CategoryFilterPopoverContent
            categories={categories}
            appliedIds={appliedIds}
            onApply={(ids) => {
              onApply(ids);
              onOpenChange(false);
            }}
          />
        )}
      </Popover>
    </>
  );
}

interface CategoryFilterPopoverContentProps {
  categories: Category[];
  appliedIds: string[];
  onApply: (ids: string[]) => void;
}

/** Mounted fresh each time the popover opens, so the pending selection simply initializes from appliedIds. */
function CategoryFilterPopoverContent({ categories, appliedIds, onApply }: CategoryFilterPopoverContentProps) {
  const [pendingIds, setPendingIds] = useState<string[]>(appliedIds);
  const [search, setSearch] = useState("");

  function toggle(id: string) {
    setPendingIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  const visibleCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <div className="p-3 pb-2">
        <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-100)]">
          <Search size={16} className="text-slate-500" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            aria-label="Search categories"
            placeholder="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-grow bg-transparent text-sm text-slate-900 outline-none"
          />
        </div>
      </div>
      <div className="flex justify-between px-[22px] pb-1.5 text-xs font-bold text-slate-500">
        <span>{pendingIds.length} selected</span>
        <span>Expenses in range</span>
      </div>
      <div role="group" aria-label="Categories" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {visibleCategories.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">No categories found.</p>}
        {visibleCategories.map((category) => {
          const checked = pendingIds.includes(category.id);
          const hasExpenses = category.expense_count > 0;
          return (
            <label
              key={category.id}
              className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-bold ${
                checked ? "bg-slate-50 text-slate-900" : hasExpenses ? "text-slate-900" : "text-slate-500"
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(category.id)} className="sr-only" />
              <span
                aria-hidden="true"
                className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
                  checked ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-transparent"
                }`}
              >
                <Check size={12} strokeWidth={3.5} aria-hidden="true" />
              </span>
              <span className="flex-grow">{category.name}</span>
              <span className="text-[13px] font-semibold text-slate-500">{category.expense_count}</span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5 rounded-b-xl border-t border-slate-100 bg-slate-50 px-4 py-3">
        <button
          type="button"
          onClick={() => setPendingIds([])}
          className="h-[38px] px-2 text-sm font-bold text-primary hover:text-primary-hover"
        >
          Clear
        </button>
        <Button className="ml-auto h-[38px] px-4 text-sm" onClick={() => onApply(pendingIds)}>
          Apply ({pendingIds.length})
        </Button>
      </div>
    </>
  );
}
