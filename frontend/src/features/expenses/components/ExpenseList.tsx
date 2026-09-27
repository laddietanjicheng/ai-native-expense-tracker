import { Pencil, Trash2 } from "lucide-react";
import { centsToDisplay } from "@/lib/money";
import { formatDayGroupLabel } from "@/lib/dates";
import { CategoryIcon } from "@/features/categories/components/CategoryIcon";
import { IconButton } from "@/components/ui/IconButton";
import type { Expense } from "../types";

interface DayGroup {
  dateISO: string;
  label: string;
  totalCents: number;
  items: Expense[];
}

/** Groups already-sorted expenses into per-day buckets, preserving order. */
export function groupExpensesByDay(items: Expense[]): DayGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, Expense[]>();
  for (const item of items) {
    if (!buckets.has(item.expense_date)) {
      buckets.set(item.expense_date, []);
      order.push(item.expense_date);
    }
    buckets.get(item.expense_date)?.push(item);
  }
  return order.map((dateISO) => {
    const groupItems = buckets.get(dateISO) ?? [];
    return {
      dateISO,
      label: formatDayGroupLabel(dateISO),
      totalCents: groupItems.reduce((sum, item) => sum + item.amount_cents, 0),
      items: groupItems,
    };
  });
}

interface ExpenseListProps {
  items: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

export function ExpenseList({ items, onEdit, onDelete }: ExpenseListProps) {
  const days = groupExpensesByDay(items);

  return (
    <div>
      {days.map((day) => (
        <div key={day.dateISO}>
          <div className="flex h-10 items-center justify-between border-y border-slate-200 bg-slate-50 px-6">
            <span className="text-[13px] font-bold text-slate-600">{day.label}</span>
            <span className="text-[13px] font-bold tabular-nums text-slate-600">
              {centsToDisplay(day.totalCents)}
            </span>
          </div>
          {day.items.map((item) => {
            const metaText = item.sub_category
              ? `${item.category.name} · ${item.sub_category.name}`
              : item.category.name;
            const title = item.note || item.category.name;
            return (
              <div key={item.id} className="flex h-16 items-center gap-3.5 border-b border-slate-100 pl-6 pr-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <CategoryIcon name={item.category.name} />
                </span>
                <div className="flex min-w-0 flex-grow flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold text-slate-900">{title}</span>
                  <span className="text-[13px] text-slate-500">{metaText}</span>
                </div>
                <span className="w-[120px] flex-shrink-0 text-right text-[15px] font-bold tabular-nums">
                  {centsToDisplay(item.amount_cents)}
                </span>
                <span className="flex flex-shrink-0 gap-0.5 pl-2">
                  <IconButton aria-label={`Edit ${title}`} onClick={() => onEdit(item)}>
                    <Pencil size={18} aria-hidden="true" />
                  </IconButton>
                  <IconButton aria-label={`Delete ${title}`} onClick={() => onDelete(item)}>
                    <Trash2 size={18} aria-hidden="true" />
                  </IconButton>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
