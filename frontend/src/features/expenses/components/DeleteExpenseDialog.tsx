"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryIcon } from "@/features/categories/components/CategoryIcon";
import { centsToDisplay } from "@/lib/money";
import { formatFullDate } from "@/lib/dates";
import { useDeleteExpense } from "../hooks";
import type { Expense } from "../types";

interface DeleteExpenseDialogProps {
  expense: Expense | null;
  onClose: () => void;
}

export function DeleteExpenseDialog({ expense, onClose }: DeleteExpenseDialogProps) {
  const deleteMutation = useDeleteExpense();

  const metaText = expense
    ? expense.sub_category
      ? `${expense.category.name} · ${expense.sub_category.name} · ${formatFullDate(expense.expense_date)}`
      : `${expense.category.name} · ${formatFullDate(expense.expense_date)}`
    : "";
  const title = expense ? expense.note || expense.category.name : "";

  return (
    <ConfirmDialog
      open={expense !== null}
      labelledBy="delete-expense-title"
      title="Delete this expense?"
      confirmLabel="Delete expense"
      message="It will be removed from your list and totals."
      onConfirm={() => (expense ? deleteMutation.mutateAsync(expense.id) : Promise.resolve())}
      onClose={onClose}
    >
      {expense && (
        <div className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
            <CategoryIcon name={expense.category.name} size={16} />
          </span>
          <div className="flex min-w-0 flex-grow flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{title}</span>
            <span className="text-[13px] text-slate-500">{metaText}</span>
          </div>
          <span className="text-base font-extrabold tabular-nums">{centsToDisplay(expense.amount_cents)}</span>
        </div>
      )}
    </ConfirmDialog>
  );
}
