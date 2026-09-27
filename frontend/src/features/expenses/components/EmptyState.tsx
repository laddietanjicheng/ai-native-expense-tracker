import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface EmptyStateProps {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
  onAddExpense: () => void;
}

export function EmptyState({ chips, onClearAll, onAddExpense }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Search size={24} aria-hidden="true" />
      </span>
      <h2 className="mt-1 text-xl font-extrabold">No expenses match these filters</h2>
      <p className="text-[15px] text-slate-500">Try a wider date range or a different category.</p>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {chips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} removeLabel={`Remove ${chip.label} filter`} />
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-3">
        <Button variant="secondary" onClick={onClearAll}>
          Clear filters
        </Button>
        <Button variant="primary" onClick={onAddExpense}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          Add expense
        </Button>
      </div>
    </div>
  );
}
