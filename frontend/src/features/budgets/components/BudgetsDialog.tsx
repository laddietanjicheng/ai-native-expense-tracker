"use client";

import { useEffect } from "react";
import { useForm, Controller, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquare, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { centsToDisplay, centsToInputValue, parseAmountToCents } from "@/lib/money";
import { ApiError } from "@/lib/apiClient";
import { currentMonthKey, shiftMonthKey, shortMonthKeyLabel } from "@/features/insights/monthUtils";
import { useChat } from "@/features/chat/ChatContext";

const PLAN_WITH_CLAUDE_TEXT = "I want to spend at most S$ this month. How should I split it?";
const PLAN_WITH_CLAUDE_CURSOR_INDEX = PLAN_WITH_CLAUDE_TEXT.indexOf("S$") + 2;
import { budgetsFormSchema, type BudgetsFormValues } from "../schemas";
import { useBudgets, usePutBudgets } from "../hooks";
import type { BudgetRow, BudgetsOut } from "../types";

interface BudgetsDialogProps {
  open: boolean;
  onClose: () => void;
}

function averageRangeLabel(): string {
  const now = currentMonthKey();
  return `${shortMonthKeyLabel(shiftMonthKey(now, -3))} – ${shortMonthKeyLabel(shiftMonthKey(now, -1))}`;
}

function defaultValuesFor(data: BudgetsOut | undefined): BudgetsFormValues {
  return {
    overall: data?.overall_cents != null ? centsToInputValue(data.overall_cents) : "",
    categories: Object.fromEntries(
      (data?.categories ?? []).map((row) => [row.category_id, row.amount_cents != null ? centsToInputValue(row.amount_cents) : ""])
    ),
  };
}

export function BudgetsDialog({ open, onClose }: BudgetsDialogProps) {
  const { data, isLoading } = useBudgets();
  const putMutation = usePutBudgets();
  const { openWithPrefill } = useChat();

  function handlePlanWithClaude() {
    onClose();
    openWithPrefill(PLAN_WITH_CLAUDE_TEXT, PLAN_WITH_CLAUDE_CURSOR_INDEX);
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<BudgetsFormValues>({
    resolver: zodResolver(budgetsFormSchema),
    defaultValues: defaultValuesFor(data),
  });

  useEffect(() => {
    if (open && data) {
      reset(defaultValuesFor(data));
    }
  }, [open, data, reset]);

  async function onSubmit(values: BudgetsFormValues) {
    const categories = (data?.categories ?? [])
      .map((row) => {
        const cents = parseAmountToCents(values.categories[row.category_id] ?? "");
        return cents !== null ? { category_id: row.category_id, amount_cents: cents } : null;
      })
      .filter((row): row is { category_id: string; amount_cents: number } => row !== null);
    const overallCents = parseAmountToCents(values.overall);

    try {
      await putMutation.mutateAsync({ overall_cents: overallCents, categories });
      onClose();
    } catch (error) {
      setError("root", { message: error instanceof ApiError ? error.message : "Could not save budgets. Try again." });
    }
  }

  const rows: BudgetRow[] = data?.categories ?? [];

  return (
    <Dialog open={open} onClose={onClose} labelledBy="budgets-dialog-title" widthClassName="max-w-[560px]">
      <div className="flex items-start justify-between px-7 pb-4 pt-6">
        <div className="flex flex-col gap-1.5">
          <h2 id="budgets-dialog-title" className="text-[22px] font-extrabold tracking-tight">
            Monthly budgets
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Budgets repeat every month. Leave a field empty for no budget.
          </p>
        </div>
        <IconButton aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>

      {isLoading ? (
        <div className="px-7 pb-6 text-sm text-slate-500">Loading budgets…</div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-grow flex-col">
          <div className="flex max-h-[55vh] flex-grow flex-col overflow-y-auto px-7 pb-4">
            <div className="flex flex-col gap-3 rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-grow flex-col gap-0.5">
                  <label htmlFor="overall" className="text-[15px] font-extrabold">
                    Overall
                  </label>
                  {data && (
                    <span className="text-[13px] text-slate-500">
                      Avg {centsToDisplay(rows.reduce((sum, row) => sum + row.avg3_cents, 0))} / month
                    </span>
                  )}
                </div>
                <AmountField id="overall" placeholder="No budget" register={register("overall")} invalid={Boolean(errors.overall)} />
              </div>
              {errors.overall && <p className="text-sm text-danger">{errors.overall.message}</p>}
              <div className="flex items-center gap-2.5">
                <p className="m-0 flex-grow text-[13px] text-slate-600">
                  Not sure how to split it? Tell Claude your target and priorities in chat.
                </p>
                <Button type="button" variant="secondary" className="h-9 px-3 text-sm" onClick={handlePlanWithClaude}>
                  <MessageSquare size={16} aria-hidden="true" />
                  Plan with Claude
                </Button>
              </div>
            </div>

            <h3 className="mb-1 mt-5 text-[13px] font-bold uppercase tracking-wide text-slate-600">By category</h3>
            {rows.map((row) => (
              <div key={row.category_id} className="flex items-center gap-4 border-b border-slate-100 py-3.5">
                <div className="flex flex-grow flex-col gap-0.5">
                  <label htmlFor={`cat-${row.category_id}`} className="text-[15px] font-bold">
                    {row.name}
                  </label>
                  <span className="text-[13px] text-slate-500">Avg {centsToDisplay(row.avg3_cents)} / month</span>
                </div>
                <Controller
                  control={control}
                  name={`categories.${row.category_id}`}
                  render={({ field }) => (
                    <AmountField
                      id={`cat-${row.category_id}`}
                      placeholder="No budget"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={Boolean(errors.categories?.[row.category_id])}
                    />
                  )}
                />
                {errors.categories?.[row.category_id] && (
                  <p className="text-sm text-danger">{errors.categories[row.category_id]?.message}</p>
                )}
              </div>
            ))}
            {errors.root && <p className="pt-2 text-sm text-danger">{errors.root.message}</p>}
          </div>

          <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-7 py-4">
            <span className="text-[13px] text-slate-500">Averages cover {averageRangeLabel()}</span>
            <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={putMutation.isPending}>
              Save budgets
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

interface AmountFieldProps {
  id: string;
  placeholder: string;
  invalid: boolean;
  value?: string;
  onChange?: (value: string) => void;
  register?: UseFormRegisterReturn<"overall">;
}

function AmountField({ id, placeholder, invalid, value, onChange, register }: AmountFieldProps) {
  return (
    <div
      className={`flex h-[46px] w-[180px] flex-shrink-0 items-stretch overflow-hidden rounded-lg border bg-white ${
        invalid ? "border-danger" : "border-slate-300"
      }`}
    >
      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-600">
        S$
      </span>
      {register ? (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          {...register}
          className="min-w-0 flex-grow bg-transparent px-3 text-right text-[15px] font-bold tabular-nums text-slate-900 outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-w-0 flex-grow bg-transparent px-3 text-right text-[15px] font-bold tabular-nums text-slate-900 outline-none"
        />
      )}
    </div>
  );
}
