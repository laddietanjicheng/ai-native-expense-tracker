"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCategories } from "../hooks";
import { CategoryTree } from "./CategoryTree";

export function CategoriesPageContent() {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const subCount = categories.reduce((sum, category) => sum + category.sub_categories.length, 0);
  const [addingCategory, setAddingCategory] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold tracking-tight">Categories</h1>
          <p className="text-sm text-slate-500">
            {categories.length} {categories.length === 1 ? "category" : "categories"} · {subCount} sub-categories
          </p>
        </div>
        <Button onClick={() => setAddingCategory(true)}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          Add category
        </Button>
      </div>

      {categoriesQuery.isLoading ? (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : categoriesQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-8 py-16 text-center">
          <p className="text-[15px] font-semibold text-slate-700">Could not load categories.</p>
          <button
            type="button"
            onClick={() => categoriesQuery.refetch()}
            className="text-[15px] font-bold text-primary hover:text-primary-hover"
          >
            Try again
          </button>
        </div>
      ) : (
        <CategoryTree
          categories={categories}
          showAddForm={addingCategory}
          onCloseAddForm={() => setAddingCategory(false)}
        />
      )}
    </>
  );
}
