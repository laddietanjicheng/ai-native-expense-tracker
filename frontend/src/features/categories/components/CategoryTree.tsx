"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCreateCategory, useDeleteCategory, useRenameCategory } from "../hooks";
import { ApiError } from "@/lib/apiClient";
import { CategoryRow } from "./CategoryRow";
import { CategoryBlockedDialog } from "./CategoryBlockedDialog";
import { InlineNameForm } from "./InlineNameForm";
import type { Category } from "../types";

interface CategoryTreeProps {
  categories: Category[];
  /** Show the inline "add category" row at the top, triggered from the page header. */
  showAddForm: boolean;
  onCloseAddForm: () => void;
}

interface BlockedState {
  categoryId: string;
  categoryName: string;
  activeExpenseCount: number;
}

interface PendingDelete {
  category: Category;
  parentName?: string;
}

export function CategoryTree({ categories, showAddForm, onCloseAddForm }: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<BlockedState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const renameCategory = useRenameCategory();

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(category: Category, parentName?: string) {
    try {
      await deleteCategory.mutateAsync(category.id);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CATEGORY_IN_USE") {
        const activeExpenseCount = Number(error.details?.active_expense_count ?? 0);
        setBlocked({
          categoryId: category.id,
          categoryName: parentName ?? category.name,
          activeExpenseCount,
        });
        return;
      }
      throw error;
    }
  }

  const pendingSubCount = pendingDelete?.category.sub_categories.length ?? 0;
  const pendingMessage =
    pendingSubCount > 0
      ? `This will also delete its ${pendingSubCount} sub-${pendingSubCount === 1 ? "category" : "categories"}.`
      : "This can't be undone.";

  return (
    <section
      aria-label="Category list"
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      {showAddForm && (
        <InlineNameForm
          onSubmit={(name) => createCategory.mutateAsync({ name })}
          onClose={onCloseAddForm}
          submitLabel="Save"
          ariaLabel="New category name"
          className="h-16 border-b border-slate-200 px-4"
        />
      )}

      {categories.length === 0 && !showAddForm && (
        <p className="px-4 py-10 text-center text-sm text-slate-500">No categories yet.</p>
      )}

      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          expanded={expanded.has(category.id)}
          onToggleExpand={() => toggleExpanded(category.id)}
          onRename={(id, name) => renameCategory.mutateAsync({ id, name })}
          onDelete={() => setPendingDelete({ category })}
          onDeleteSub={(sub) => setPendingDelete({ category: sub, parentName: category.name })}
          onCreateSub={(name) => createCategory.mutateAsync({ name, parent_id: category.id })}
        />
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        labelledBy="delete-category-title"
        title={pendingDelete ? `Delete "${pendingDelete.category.name}"?` : ""}
        message={pendingMessage}
        confirmLabel="Delete"
        onConfirm={() => (pendingDelete ? handleDelete(pendingDelete.category, pendingDelete.parentName) : Promise.resolve())}
        onClose={() => setPendingDelete(null)}
      />

      <CategoryBlockedDialog
        categoryId={blocked?.categoryId ?? null}
        categoryName={blocked?.categoryName ?? ""}
        activeExpenseCount={blocked?.activeExpenseCount ?? 0}
        onClose={() => setBlocked(null)}
      />
    </section>
  );
}
