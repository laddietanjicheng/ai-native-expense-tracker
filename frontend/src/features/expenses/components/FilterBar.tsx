"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { DateFilter } from "./filters/DateFilter";
import { CategoryFilter } from "./filters/CategoryFilter";
import { SubCategoryFilter } from "./filters/SubCategoryFilter";
import { SortFilter } from "./filters/SortFilter";
import { buildFilterChips, resolveChipActions } from "../filterChips";
import type { Category } from "@/features/categories/types";
import type { ExpenseFilters } from "../useExpenseFilters";

type OpenFilter = "date" | "category" | "sub_category" | "sort" | null;

interface FilterBarProps {
  filters: ExpenseFilters;
  categories: Category[];
  dateRangeLabel: string;
  totalCount: number;
  onChange: (patch: Partial<ExpenseFilters>) => void;
  onClearAll: () => void;
}

export function FilterBar({ filters, categories, dateRangeLabel, totalCount, onChange, onClearAll }: FilterBarProps) {
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);

  const selectedCategory =
    filters.categoryIds.length === 1 ? categories.find((c) => c.id === filters.categoryIds[0]) : null;

  const chips = resolveChipActions(buildFilterChips(filters, categories, dateRangeLabel), filters, onChange);
  const showAppliedRow = chips.length > 0;

  return (
    <section aria-label="Filters" className="flex flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 p-4">
        <DateFilter
          preset={filters.preset}
          customFrom={filters.customFrom}
          customTo={filters.customTo}
          open={openFilter === "date"}
          onOpenChange={(open) => setOpenFilter(open ? "date" : null)}
          onApplyPreset={(preset) => onChange({ preset, customFrom: null, customTo: null })}
          onApplyCustom={(customFrom, customTo) => onChange({ preset: "custom", customFrom, customTo })}
        />
        <CategoryFilter
          categories={categories}
          appliedIds={filters.categoryIds}
          open={openFilter === "category"}
          onOpenChange={(open) => setOpenFilter(open ? "category" : null)}
          onApply={(ids) => onChange({ categoryIds: ids, subCategoryId: null })}
        />
        {selectedCategory && (
          <SubCategoryFilter
            subCategories={selectedCategory.sub_categories}
            appliedId={filters.subCategoryId}
            open={openFilter === "sub_category"}
            onOpenChange={(open) => setOpenFilter(open ? "sub_category" : null)}
            onApply={(id) => onChange({ subCategoryId: id })}
          />
        )}
        <SortFilter
          sort={filters.sort}
          order={filters.order}
          open={openFilter === "sort"}
          onOpenChange={(open) => setOpenFilter(open ? "sort" : null)}
          onApply={(sort, order) => onChange({ sort, order })}
        />
      </div>

      {showAppliedRow && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          <span className="mr-1 text-sm font-extrabold">
            {totalCount} {totalCount === 1 ? "result" : "results"}
          </span>
          {chips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} removeLabel={`Remove ${chip.label} filter`} />
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="h-[30px] px-2 text-[13px] font-bold text-primary hover:text-primary-hover"
          >
            Clear all
          </button>
        </div>
      )}
    </section>
  );
}
