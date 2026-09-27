"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

function fullHistoryHref(categoryId: string): string {
  const params = new URLSearchParams({ preset: "all_time", category_id: categoryId });
  return `/?${params.toString()}`;
}

interface CategoryBlockedDialogProps {
  categoryId: string | null;
  categoryName: string;
  activeExpenseCount: number;
  onClose: () => void;
}

export function CategoryBlockedDialog({
  categoryId,
  categoryName,
  activeExpenseCount,
  onClose,
}: CategoryBlockedDialogProps) {
  const open = Boolean(categoryId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="category-blocked-title"
      widthClassName="max-w-[440px]"
      role="alertdialog"
    >
      <div className="flex flex-col gap-4 p-7">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning">
            <TriangleAlert size={22} aria-hidden="true" />
          </span>
          <h2 id="category-blocked-title" className="text-xl font-extrabold">
            Can&rsquo;t delete &ldquo;{categoryName}&rdquo;
          </h2>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-700">
          <strong className="font-extrabold text-slate-900">
            {activeExpenseCount} {activeExpenseCount === 1 ? "expense" : "expenses"}
          </strong>{" "}
          still use {categoryName} or one of its sub-categories. Move them to another category or
          delete them first, then try again.
        </p>
        <div className="mt-2 flex justify-end gap-3">
          <Link
            href={categoryId ? fullHistoryHref(categoryId) : "/"}
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-[18px] text-[15px] font-bold text-slate-900 hover:bg-slate-50"
          >
            View these expenses
          </Link>
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </Dialog>
  );
}
