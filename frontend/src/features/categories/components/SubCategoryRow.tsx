"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { InlineNameForm } from "./InlineNameForm";
import type { Category } from "../types";

interface SubCategoryRowProps {
  sub: Category;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: () => void;
}

export function SubCategoryRow({ sub, onRename, onDelete }: SubCategoryRowProps) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <InlineNameForm
        initialValue={sub.name}
        onSubmit={(name) => onRename(sub.id, name)}
        onClose={() => setRenaming(false)}
        submitLabel="Save"
        ariaLabel={`Rename ${sub.name}`}
        trailingText={`${sub.expense_count} expenses`}
        className="h-[52px] border-b border-slate-100 bg-slate-50 pl-[110px] pr-3"
      />
    );
  }

  return (
    <div className="flex h-[52px] items-center gap-3 border-b border-slate-100 bg-slate-50 pl-[110px] pr-3">
      <span className="text-[15px] font-semibold">{sub.name}</span>
      <span className="text-[13px] text-slate-500">{sub.expense_count} expenses</span>
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton aria-label={`Rename ${sub.name}`} onClick={() => setRenaming(true)}>
          <Pencil size={18} aria-hidden="true" />
        </IconButton>
        <IconButton aria-label={`Delete ${sub.name}`} onClick={onDelete}>
          <Trash2 size={18} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
