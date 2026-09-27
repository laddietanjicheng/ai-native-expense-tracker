"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useExpenseFilters } from "../useExpenseFilters";
import { useExpenses } from "../hooks";
import { useCategories } from "@/features/categories/hooks";
import { buildFilterChips, resolveChipActions } from "../filterChips";
import { SummaryCards } from "./SummaryCards";
import { FilterBar } from "./FilterBar";
import { ExpenseList } from "./ExpenseList";
import { EmptyState } from "./EmptyState";
import { Pagination } from "./Pagination";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";
import { daySpan, formatDateRangeLabel } from "@/lib/dates";
import type { Expense } from "../types";

const PAGE_SIZE = 20;

export function ExpensesPageContent() {
  const { filters, dateRange, update, clearFilters } = useExpenseFilters();
  const categoriesQuery = useCategories(dateRange);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const listParams = useMemo(
    () => ({
      date_from: dateRange.date_from ?? undefined,
      date_to: dateRange.date_to ?? undefined,
      category_id: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
      sub_category_id: filters.subCategoryId ?? undefined,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      page_size: PAGE_SIZE,
    }),
    [filters, dateRange]
  );

  const expensesQuery = useExpenses(listParams);
  const [formState, setFormState] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  });
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const meta = expensesQuery.data?.meta;
  const items = expensesQuery.data?.items ?? [];
  const isBounded = dateRange.date_from !== null && dateRange.date_to !== null;
  const dayCount = isBounded ? daySpan({ date_from: dateRange.date_from!, date_to: dateRange.date_to! }) : null;
  const dateRangeLabel = isBounded
    ? formatDateRangeLabel({ date_from: dateRange.date_from!, date_to: dateRange.date_to! })
    : "All time";

  const chips = resolveChipActions(buildFilterChips(filters, categories, dateRangeLabel), filters, update);

  function openAddDialog() {
    setFormState({ open: true, expense: null });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold tracking-tight">Expenses</h1>
          <p className="text-sm text-slate-500">Track and review what you spend</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          Add expense
        </Button>
      </div>

      <SummaryCards
        totalAmountCents={meta?.total_amount_cents ?? 0}
        totalCount={meta?.total_count ?? 0}
        categoryCount={meta?.category_count ?? 0}
        dateRangeLabel={dateRangeLabel}
        dayCount={dayCount}
      />

      <FilterBar
        filters={filters}
        categories={categories}
        dateRangeLabel={dateRangeLabel}
        totalCount={meta?.total_count ?? 0}
        onChange={update}
        onClearAll={clearFilters}
      />

      <section aria-label="Expense list" className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-14 items-baseline gap-2.5 px-6 pt-[18px]">
          <h2 className="text-[17px] font-extrabold">All expenses</h2>
          {meta && (
            <span className="text-sm text-slate-500">
              {meta.total_count} {meta.total_count === 1 ? "expense" : "expenses"}
            </span>
          )}
        </div>

        {expensesQuery.isLoading ? (
          <ListSkeleton />
        ) : expensesQuery.isError ? (
          <ErrorState onRetry={() => expensesQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState chips={chips} onClearAll={clearFilters} onAddExpense={openAddDialog} />
        ) : (
          <>
            <ExpenseList
              items={items}
              onEdit={(expense) => setFormState({ open: true, expense })}
              onDelete={(expense) => setDeletingExpense(expense)}
            />
            <Pagination
              page={filters.page}
              pageSize={PAGE_SIZE}
              totalCount={meta?.total_count ?? 0}
              onPageChange={(page) => update({ page }, { resetPage: false })}
            />
          </>
        )}
      </section>

      <ExpenseFormDialog
        open={formState.open}
        onClose={() => setFormState({ open: false, expense: null })}
        categories={categories}
        expense={formState.expense}
        onRequestDelete={(expense) => {
          setFormState({ open: false, expense: null });
          setDeletingExpense(expense);
        }}
      />

      <DeleteExpenseDialog expense={deletingExpense} onClose={() => setDeletingExpense(null)} />
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <p className="text-[15px] font-semibold text-slate-700">Could not load expenses.</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
