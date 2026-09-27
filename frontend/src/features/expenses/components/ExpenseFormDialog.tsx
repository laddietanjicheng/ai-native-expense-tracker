"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { expenseFormSchema, type ExpenseFormValues } from "../schemas";
import { useCreateExpense, useUpdateExpense } from "../hooks";
import { parseAmountToCents, centsToInputValue } from "@/lib/money";
import { todayISOInSingapore } from "@/lib/dates";
import { ApiError } from "@/lib/apiClient";
import type { Category } from "@/features/categories/types";
import type { Expense, ExpenseInput } from "../types";

interface ExpenseFormDialogProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  expense?: Expense | null;
  onRequestDelete?: (expense: Expense) => void;
}

const NOTE_MAX_LENGTH = 500;

// Server validation field paths (dot-joined for nested paths) mapped to form fields.
// Anything not listed here -- including the "body" key for model-level errors -- goes to root.
const FIELD_TO_FORM_FIELD: Partial<Record<string, keyof ExpenseFormValues>> = {
  amount_cents: "amount",
  expense_date: "expense_date",
  category_id: "category_id",
  sub_category_id: "sub_category_id",
  note: "note",
};

function resolveFormField(fieldPath: string): keyof ExpenseFormValues | null {
  const key = fieldPath.split(".").pop() ?? fieldPath;
  return FIELD_TO_FORM_FIELD[key] ?? null;
}

function defaultValuesFor(expense: Expense | null | undefined): ExpenseFormValues {
  if (!expense) {
    return { amount: "", expense_date: todayISOInSingapore(), category_id: "", sub_category_id: "", note: "" };
  }
  return {
    amount: centsToInputValue(expense.amount_cents),
    expense_date: expense.expense_date,
    category_id: expense.category.id,
    sub_category_id: expense.sub_category?.id ?? "",
    note: expense.note ?? "",
  };
}

export function ExpenseFormDialog({ open, onClose, categories, expense, onRequestDelete }: ExpenseFormDialogProps) {
  const isEdit = Boolean(expense);
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: defaultValuesFor(expense),
  });

  useEffect(() => {
    if (open) {
      reset(defaultValuesFor(expense));
    }
  }, [open, expense, reset]);

  const categoryId = watch("category_id");
  const note = watch("note") ?? "";
  const selectedCategory = categories.find((c) => c.id === categoryId);

  function handleCategoryChange(nextCategoryId: string) {
    setValue("category_id", nextCategoryId, { shouldValidate: true });
    setValue("sub_category_id", "");
  }

  async function onSubmit(values: ExpenseFormValues) {
    const cents = parseAmountToCents(values.amount);
    if (cents === null) {
      setError("amount", { message: "Enter a valid amount" });
      return;
    }
    const input: ExpenseInput = {
      amount_cents: cents,
      expense_date: values.expense_date,
      category_id: values.category_id,
      sub_category_id: values.sub_category_id || null,
      note: values.note?.trim() ? values.note.trim() : null,
    };
    try {
      if (isEdit && expense) {
        await updateMutation.mutateAsync({ id: expense.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
        const fields = (error.details?.fields as Record<string, string> | undefined) ?? {};
        const rootMessages: string[] = [];
        for (const [fieldPath, message] of Object.entries(fields)) {
          const formField = resolveFormField(fieldPath);
          if (formField) {
            setError(formField, { message: String(message) });
          } else {
            rootMessages.push(String(message));
          }
        }
        if (rootMessages.length > 0) {
          setError("root", { message: rootMessages.join(" ") });
        }
      } else if (error instanceof ApiError) {
        setError("root", { message: error.message });
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="expense-form-title" widthClassName="max-w-[520px]">
      <div className="flex items-center justify-between px-7 pb-5 pt-6">
        <h2 id="expense-form-title" className="text-[22px] font-extrabold tracking-tight">
          {isEdit ? "Edit expense" : "Add expense"}
        </h2>
        <IconButton aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="flex flex-col gap-5 px-7 pb-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="amount" className="text-sm font-bold">
              Amount
            </label>
            <div
              className={`flex h-14 overflow-hidden rounded-lg border transition-shadow ${
                errors.amount
                  ? "border-danger"
                  : "border-slate-300 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-100)]"
              }`}
            >
              <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3.5 text-base font-bold text-slate-600">
                S$
              </span>
              <input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                {...register("amount")}
                className="min-w-0 flex-grow bg-transparent px-3.5 text-2xl font-extrabold tabular-nums text-slate-900 outline-none"
              />
            </div>
            {errors.amount && <p className="text-sm text-danger">{errors.amount.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense_date" className="text-sm font-bold">
              Date
            </label>
            <input
              id="expense_date"
              type="date"
              {...register("expense_date")}
              className="h-[46px] rounded-lg border border-slate-300 px-3.5 text-[15px] font-medium text-slate-900 outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-100)]"
            />
            {errors.expense_date && <p className="text-sm text-danger">{errors.expense_date.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Category</span>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    aria-label="Category"
                    value={field.value}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    options={[
                      { value: "", label: "Select category" },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                )}
              />
              {errors.category_id && <p className="text-sm text-danger">{errors.category_id.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">
                Sub-category <span className="font-medium text-slate-500">(optional)</span>
              </span>
              <Controller
                control={control}
                name="sub_category_id"
                render={({ field }) => (
                  <Select
                    aria-label="Sub-category"
                    disabled={!selectedCategory || selectedCategory.sub_categories.length === 0}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    options={[
                      { value: "", label: "None" },
                      ...(selectedCategory?.sub_categories ?? []).map((sub) => ({
                        value: sub.id,
                        label: sub.name,
                      })),
                    ]}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="note" className="text-sm font-bold">
              Note <span className="font-medium text-slate-500">(optional)</span>
            </label>
            <textarea
              id="note"
              rows={3}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="What was this for?"
              {...register("note")}
              className="resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] leading-relaxed text-slate-900 outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-100)]"
            />
            <span className="self-end text-xs text-slate-500">
              {note.length} / {NOTE_MAX_LENGTH}
            </span>
            {errors.note && <p className="text-sm text-danger">{errors.note.message}</p>}
          </div>
          {errors.root && <p className="text-sm text-danger">{errors.root.message}</p>}
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-7 py-4">
          {isEdit && expense && onRequestDelete && (
            <button
              type="button"
              onClick={() => onRequestDelete(expense)}
              className="inline-flex items-center gap-1.5 text-[15px] font-bold text-danger"
            >
              <Trash2 size={18} aria-hidden="true" />
              Delete
            </button>
          )}
          <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isEdit ? "Save changes" : "Add expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
