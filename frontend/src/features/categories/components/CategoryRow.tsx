"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { CategoryIcon } from "./CategoryIcon";
import { InlineNameForm } from "./InlineNameForm";
import { SubCategoryRow } from "./SubCategoryRow";
import type { Category } from "../types";

export const SUB_CATEGORY_LIMIT = 50;

interface CategoryRowProps {
  category: Category;
  expanded: boolean;
  onToggleExpand: () => void;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: () => void;
  onDeleteSub: (sub: Category) => void;
  onCreateSub: (name: string) => Promise<unknown>;
}

export function CategoryRow({
  category,
  expanded,
  onToggleExpand,
  onRename,
  onDelete,
  onDeleteSub,
  onCreateSub,
}: CategoryRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const subCount = category.sub_categories.length;

  return (
    <div>
      {renaming ? (
        <InlineNameForm
          initialValue={category.name}
          onSubmit={(name) => onRename(category.id, name)}
          onClose={() => setRenaming(false)}
          submitLabel="Save"
          ariaLabel={`Rename ${category.name}`}
          className="h-16 border-b border-slate-100 pl-14 pr-3"
        />
      ) : (
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-3">
          <IconButton
            aria-label={expanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
            aria-expanded={expanded}
            onClick={onToggleExpand}
          >
            {expanded ? (
              <ChevronDown size={18} aria-hidden="true" />
            ) : (
              <ChevronRight size={18} aria-hidden="true" />
            )}
          </IconButton>
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <CategoryIcon name={category.name} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold">{category.name}</span>
            <span className="text-[13px] text-slate-500">
              {subCount === 0 ? "No sub-categories" : `${subCount} sub-${subCount === 1 ? "category" : "categories"}`}{" "}
              · {category.expense_count} expenses
            </span>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton aria-label={`Rename ${category.name}`} onClick={() => setRenaming(true)}>
              <Pencil size={18} aria-hidden="true" />
            </IconButton>
            <IconButton aria-label={`Delete ${category.name}`} onClick={onDelete}>
              <Trash2 size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      )}

      {expanded && (
        <>
          {category.sub_categories.map((sub) => (
            <SubCategoryRow key={sub.id} sub={sub} onRename={onRename} onDelete={() => onDeleteSub(sub)} />
          ))}

          {addingSub ? (
            <InlineNameForm
              onSubmit={onCreateSub}
              onClose={() => setAddingSub(false)}
              submitLabel="Add"
              ariaLabel={`New sub-category in ${category.name}`}
              placeholder={`New sub-category in ${category.name}`}
              trailingText={`${subCount} of ${SUB_CATEGORY_LIMIT} used`}
              className="h-16 border-b border-slate-200 bg-slate-50 pl-[110px] pr-3"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingSub(true)}
              disabled={subCount >= SUB_CATEGORY_LIMIT}
              className="flex h-16 w-full items-center gap-2 border-b border-slate-200 bg-slate-50 pl-[110px] pr-3 text-left text-sm font-bold text-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-slate-50"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              Add sub-category
              <span className="ml-auto shrink-0 pr-2 text-[13px] font-medium text-slate-500">
                {subCount} of {SUB_CATEGORY_LIMIT} used
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
